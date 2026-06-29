import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

export type SignatureBundle = {
  media_hash: string;
  timestamp: string;
  device_id: string;
  gps: { lat: number; lon: number } | null;
  nonce: string;
  signature: string;
  public_key: string;
  version: 1;
};

export type LedgerEntry = {
  index: number;
  previous_hash: string;
  current_hash: string;
  payload: SignatureBundle & { media_id: string };
  recorded_at: string;
};

const DEVICE_KEY = "aletheia.device";
const LEDGER_KEY = "aletheia.ledger.session"; // session-scoped; production uses server-side store

export type Device = {
  device_id: string;
  public_key: string;
  secret_key: string;
  created_at: string;
};

export function getOrCreateDevice(): Device {
  if (typeof window === "undefined") {
    return { device_id: "", public_key: "", secret_key: "", created_at: "" };
  }
  const existing = typeof window !== "undefined" ? sessionStorage.getItem(DEVICE_KEY) : null;
  if (existing) return JSON.parse(existing);
  const kp = nacl.sign.keyPair();
  const pub = naclUtil.encodeBase64(kp.publicKey);
  const device: Device = {
    device_id: "dev_" + sha256Sync(pub).slice(0, 16),
    public_key: pub,
    secret_key: naclUtil.encodeBase64(kp.secretKey),
    created_at: new Date().toISOString(),
  };
  if (typeof window !== "undefined") sessionStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  return device;
}

function sha256Sync(text: string): string {
  // simple non-crypto hash for ID derivation only
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(16, "0");
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signCapture(
  mediaBytes: Uint8Array,
  opts: { gps: { lat: number; lon: number } | null }
): Promise<SignatureBundle> {
  const device = getOrCreateDevice();
  const media_hash = await sha256Hex(mediaBytes);
  const timestamp = new Date().toISOString();
  const nonce = naclUtil.encodeBase64(nacl.randomBytes(16));
  const canonical = JSON.stringify({
    media_hash,
    timestamp,
    device_id: device.device_id,
    gps: opts.gps,
    nonce,
  });
  const sig = nacl.sign.detached(
    naclUtil.decodeUTF8(canonical),
    naclUtil.decodeBase64(device.secret_key)
  );
  return {
    media_hash,
    timestamp,
    device_id: device.device_id,
    gps: opts.gps,
    nonce,
    signature: naclUtil.encodeBase64(sig),
    public_key: device.public_key,
    version: 1,
  };
}

export type VerifyResult = {
  valid: boolean;
  reasons: string[];
  checks: { label: string; ok: boolean }[];
  trust_score: number;
  bundle: SignatureBundle;
  recomputed_hash: string;
};

export async function verifyCapture(
  mediaBytes: Uint8Array,
  bundle: SignatureBundle
): Promise<VerifyResult> {
  const reasons: string[] = [];
  const checks: { label: string; ok: boolean }[] = [];

  const recomputed_hash = await sha256Hex(mediaBytes);
  const hashOk = recomputed_hash === bundle.media_hash;
  checks.push({ label: "SHA-256 media hash matches bundle", ok: hashOk });
  if (!hashOk) reasons.push("Media bytes do not match the signed hash (tampered or wrong file).");

  let sigOk = false;
  try {
    const canonical = JSON.stringify({
      media_hash: bundle.media_hash,
      timestamp: bundle.timestamp,
      device_id: bundle.device_id,
      gps: bundle.gps,
      nonce: bundle.nonce,
    });
    sigOk = nacl.sign.detached.verify(
      naclUtil.decodeUTF8(canonical),
      naclUtil.decodeBase64(bundle.signature),
      naclUtil.decodeBase64(bundle.public_key)
    );
  } catch {
    sigOk = false;
  }
  checks.push({ label: "Ed25519 signature is valid for device public key", ok: sigOk });
  if (!sigOk) reasons.push("Cryptographic signature failed to verify.");

  const derivedDevice = "dev_" + sha256Sync(bundle.public_key).slice(0, 16);
  const deviceOk = derivedDevice === bundle.device_id;
  checks.push({ label: "Device ID derived correctly from public key", ok: deviceOk });
  if (!deviceOk) reasons.push("Device ID does not derive from the provided public key.");

  const ts = Date.parse(bundle.timestamp);
  const tsOk = !Number.isNaN(ts) && ts <= Date.now() + 60_000;
  checks.push({ label: "Timestamp is well-formed and not in the future", ok: tsOk });
  if (!tsOk) reasons.push("Timestamp invalid or in the future.");

  const valid = checks.every((c) => c.ok);
  const trust_score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  return { valid, reasons, checks, trust_score, bundle, recomputed_hash };
}

export function getLedger(): LedgerEntry[] {
  if (typeof window === "undefined") return [];
  // Ledger uses sessionStorage in web demo — ephemeral per-session.
  // Production: server-side PostgreSQL append-only store.
  const raw = typeof window !== "undefined" ? sessionStorage.getItem(LEDGER_KEY) : null;
  return raw ? JSON.parse(raw) : [];
}

export async function appendLedger(
  bundle: SignatureBundle,
  media_id: string
): Promise<LedgerEntry> {
  const ledger = getLedger();
  const prev = ledger[ledger.length - 1];
  const previous_hash = prev ? prev.current_hash : "0".repeat(64);
  const payload = { ...bundle, media_id };
  const current_hash = await sha256Hex(
    new TextEncoder().encode(previous_hash + JSON.stringify(payload))
  );
  const entry: LedgerEntry = {
    index: ledger.length,
    previous_hash,
    current_hash,
    payload,
    recorded_at: new Date().toISOString(),
  };
  ledger.push(entry);
  if (typeof window !== "undefined") sessionStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  return entry;
}

export async function verifyLedgerChain(): Promise<{ ok: boolean; brokenAt: number | null }> {
  const ledger = getLedger();
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i];
    const prev = i === 0 ? "0".repeat(64) : ledger[i - 1].current_hash;
    if (e.previous_hash !== prev) return { ok: false, brokenAt: i };
    const expected = await sha256Hex(
      new TextEncoder().encode(prev + JSON.stringify(e.payload))
    );
    if (expected !== e.current_hash) return { ok: false, brokenAt: i };
  }
  return { ok: true, brokenAt: null };
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function shorten(s: string, n = 12) {
  if (!s) return "";
  return s.length <= n * 2 + 3 ? s : `${s.slice(0, n)}…${s.slice(-n)}`;
}