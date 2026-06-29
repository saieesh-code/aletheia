import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/aletheia/Nav";
import { getOrCreateDevice, type Device } from "@/lib/aletheia";
import {
  detectDeviceCapabilities,
  computeDeviceTrustScore,
  requestAttestation,
  type DeviceCapabilities,
  type DeviceTrustScore,
  type AttestationResult,
} from "@/lib/hardware/core/attestationEngine";
import { Shield, Cpu, CheckCircle2, XCircle, Loader2, Key, Server, Smartphone } from "lucide-react";

export const Route = createFileRoute("/hardware")({
  head: () => ({
    meta: [
      { title: "Hardware Trust — Aletheia" },
      { name: "description", content: "Device security capabilities, trust scoring, and attestation." },
    ],
  }),
  component: HardwarePage,
});

function TrustRing({ score }: { score: number }) {
  const r = 40, c = 2 * Math.PI * r;
  const color = score >= 60 ? "oklch(0.72 0.19 155)" : score >= 30 ? "oklch(0.78 0.18 65)" : "oklch(0.65 0.25 25)";
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
        transform="rotate(-90 50 50)" style={{ transition: "stroke-dashoffset 1s ease" }} />
      <text x="50" y="44" textAnchor="middle" fill="currentColor" fontSize="22" fontWeight="600">{score}</text>
      <text x="50" y="60" textAnchor="middle" fill="currentColor" fontSize="8" opacity="0.5">DEVICE TRUST</text>
    </svg>
  );
}

function HardwarePage() {
  const [device, setDevice] = useState<Device | null>(null);
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [trust, setTrust] = useState<DeviceTrustScore | null>(null);
  const [attestation, setAttestation] = useState<AttestationResult | null>(null);
  const [attestBusy, setAttestBusy] = useState(false);

  useEffect(() => {
    const dev = getOrCreateDevice();
    setDevice(dev);
    const detected = detectDeviceCapabilities();
    setCaps(detected);
    setTrust(computeDeviceTrustScore(detected));
  }, []);

  async function doAttest() {
    if (!device) return;
    setAttestBusy(true);
    const r = await requestAttestation(device.device_id);
    setAttestation(r);
    setAttestBusy(false);
  }

  const HW_CAPS = ["secureEnclave", "appAttest", "tpm", "strongBox", "biometric"] as const;
  const SW_CAPS = ["secureContext", "webCrypto", "ed25519", "antiReplay"] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Hardware trust</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Current device security posture. Native hardware modules (Secure Enclave, StrongBox, TPM) activate with the Aletheia native SDK.
          </p>
        </div>

        {trust && caps && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="rounded-lg border border-border bg-card p-5 flex flex-col items-center justify-center">
              <TrustRing score={trust.overall} />
              <div className="mt-3 text-center">
                <div className="font-semibold text-sm">{trust.categoryLabel}</div>
                <div className="text-xs text-muted-foreground mt-1">{trust.hardwareScore > 0 ? "Hardware-backed" : "Software trust only"}</div>
              </div>
              <div className="mt-4 w-full space-y-2 text-xs">
                {[
                  { label: "Hardware security", score: trust.hardwareScore },
                  { label: "Software primitives", score: trust.softwareScore },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-muted-foreground mb-1"><span>{s.label}</span><span className="font-mono">{s.score}/100</span></div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, background: s.score >= 60 ? "oklch(0.72 0.19 155)" : "oklch(0.78 0.18 65)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 space-y-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" /> Hardware security modules
                  <span className="ml-auto text-xs text-muted-foreground">{HW_CAPS.filter((k) => caps[k].available).length}/{HW_CAPS.length} active</span>
                </div>
                {HW_CAPS.map((k) => <CapRow key={k} cap={caps[k]} />)}
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Software cryptographic layer
                  <span className="ml-auto text-xs text-muted-foreground">{SW_CAPS.filter((k) => caps[k].available).length}/{SW_CAPS.length} active</span>
                </div>
                {SW_CAPS.map((k) => <CapRow key={k} cap={caps[k]} />)}
              </div>
            </div>
          </div>
        )}

        {device && (
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-sm mb-3 flex items-center gap-2"><Key className="w-4 h-4 text-primary" /> Session device identity</div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <Field label="Device ID" value={device.device_id} mono />
              <Field label="Key storage" value="Browser session key (software fallback — production: Secure Enclave / StrongBox)" />
              <Field label="Created" value={new Date(device.created_at).toLocaleString()} />
              <Field label="Algorithm" value="Ed25519 via tweetnacl" />
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="font-medium text-sm mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Device attestation (simulated)
            <span className="ml-auto text-xs text-muted-foreground border border-border px-2 py-0.5 rounded-full">simulation</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            In production, App Attest (iOS) or Play Integrity (Android) verifies genuine app + device.
            This simulation demonstrates the attestation response structure.
          </p>
          {!attestation ? (
            <button onClick={doAttest} disabled={attestBusy || !device}
              className="flex items-center gap-2 border border-border bg-card px-4 py-2 rounded-md text-sm hover:bg-secondary disabled:opacity-50 transition">
              {attestBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Request simulated attestation
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" /> Attestation token received
                <span className="ml-auto text-xs text-muted-foreground border border-border px-2 py-0.5 rounded-full">simulated</span>
              </div>
              <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-1.5 text-sm">
                <Field label="Token" value={attestation.token} mono />
                <Field label="Issued at" value={new Date(attestation.issuedAt).toLocaleString()} />
                <Field label="Expires at" value={new Date(attestation.expiresAt).toLocaleString()} />
                <Field label="Replay nonce" value={attestation.replayNonce} mono />
                <Field label="App recognized" value={attestation.deviceIntegrity.appRecognized ? "Yes" : "No (needs production bundle ID)"} />
                <Field label="Device recognized" value={attestation.deviceIntegrity.deviceRecognized ? "Yes" : "No (needs real hardware)"} />
              </div>
              <button onClick={() => setAttestation(null)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="font-medium text-sm mb-4 flex items-center gap-2"><Server className="w-4 h-4 text-primary" /> SDK integration roadmap</div>
          <div className="space-y-4">
            {[
              { icon: <Smartphone className="w-4 h-4" />, platform: "iOS Secure Enclave", status: "Planned", apis: ["CryptoKit.SecureEnclave.P256", "DCAppAttestService", "DeviceCheck"], desc: "Non-exportable hardware keys. Biometric-gated signing. App Attest ties bundle ID to key." },
              { icon: <Smartphone className="w-4 h-4" />, platform: "Android StrongBox", status: "Planned", apis: ["KeyGenParameterSpec.setIsStrongBoxBacked", "Play Integrity API"], desc: "Hardware-backed Keystore. Key attestation certificate chain. Play Integrity token." },
              { icon: <Server className="w-4 h-4" />, platform: "Desktop TPM 2.0", status: "Research", apis: ["NCryptOpenStorageProvider", "WebAuthn PRF"], desc: "Platform-bound keys via TPM. Secure boot attestation. Enterprise device identity." },
            ].map((r) => (
              <div key={r.platform} className="border border-border/60 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-muted-foreground">{r.icon}</div>
                  <span className="font-medium text-sm">{r.platform}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{r.status}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{r.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.apis.map((api) => <code key={api} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded font-mono">{api}</code>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function CapRow({ cap }: { cap: { label: string; description: string; available: boolean; nativeApiRef?: string } }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="flex-shrink-0 mt-0.5">
        {cap.available ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4 text-muted-foreground/40" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{cap.label}</span>
          <span className={`text-xs ml-auto flex-shrink-0 ${cap.available ? "text-primary" : "text-muted-foreground"}`}>{cap.available ? "Active" : "Native SDK required"}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{cap.description}</div>
        {cap.nativeApiRef && <div className="font-mono text-[10px] text-muted-foreground/60 mt-1">{cap.nativeApiRef}</div>}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-b border-border/40 pb-2 last:border-0">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className={`${mono ? "font-mono text-xs" : "text-sm"} break-all`}>{value}</div>
    </div>
  );
}
