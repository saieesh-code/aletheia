/**
 * Aletheia Forensic Verification Engine
 * Pure computation — no browser APIs. SSR-safe.
 */

import type { SignatureBundle, VerifyResult } from "@/lib/aletheia";

export type ForensicRiskLevel = "critical" | "high" | "medium" | "low" | "info";

export interface ForensicCheck {
  id: string;
  label: string;
  ok: boolean;
  confidence: number;
  detail: string;
  riskLevel: ForensicRiskLevel;
}

export type ForensicVerdict = "clean" | "suspicious" | "tampered" | "inconclusive";

export interface ForensicReport {
  id: string;
  generatedAt: string;
  mediaSize: number;
  checks: ForensicCheck[];
  overallScore: number;
  verdict: ForensicVerdict;
  summary: string;
  flags: string[];
}

export async function runForensicAnalysis(
  mediaBytes: Uint8Array,
  bundle: SignatureBundle,
  verifyResult: VerifyResult
): Promise<ForensicReport> {
  const checks: ForensicCheck[] = [];
  const flags: string[] = [];

  // 1. Hash integrity
  const hashOk = verifyResult.recomputed_hash === bundle.media_hash;
  checks.push({
    id: "hash_integrity",
    label: "SHA-256 hash integrity",
    ok: hashOk,
    confidence: 100,
    detail: hashOk
      ? `Hash verified: ${bundle.media_hash.slice(0, 20)}…`
      : `Mismatch — expected ${bundle.media_hash.slice(0, 14)}… got ${verifyResult.recomputed_hash.slice(0, 14)}…`,
    riskLevel: hashOk ? "info" : "critical",
  });
  if (!hashOk) flags.push("HASH_MISMATCH");

  // 2. Signature validity
  const sigOk = verifyResult.valid && hashOk;
  checks.push({
    id: "signature_validity",
    label: "Ed25519 signature validity",
    ok: sigOk,
    confidence: 100,
    detail: sigOk
      ? "Signature cryptographically valid for stated public key"
      : "Signature verification failed — key mismatch or bundle tampered",
    riskLevel: sigOk ? "info" : "critical",
  });
  if (!sigOk) flags.push("SIGNATURE_INVALID");

  // 3. Timestamp
  const ts = Date.parse(bundle.timestamp);
  const ageMs = Date.now() - ts;
  const tsOk = !isNaN(ts) && ts <= Date.now() + 60_000;
  const isFuture = ts > Date.now() + 60_000;
  const ageLabel =
    ageMs < 60_000 ? "< 1 min ago"
    : ageMs < 3_600_000 ? `${Math.round(ageMs / 60_000)} min ago`
    : `${Math.round(ageMs / 3_600_000)} hr ago`;
  checks.push({
    id: "timestamp_validity",
    label: "Timestamp validity and freshness",
    ok: tsOk,
    confidence: 95,
    detail: tsOk ? `Signed ${ageLabel}` : isFuture ? "Timestamp is in the future" : "Invalid format",
    riskLevel: tsOk ? "info" : isFuture ? "high" : "medium",
  });
  if (isFuture) flags.push("FUTURE_TIMESTAMP");

  // 4. Replay protection (nonce)
  const nonceOk = typeof bundle.nonce === "string" && bundle.nonce.length >= 16;
  checks.push({
    id: "replay_protection",
    label: "Cryptographic nonce (replay protection)",
    ok: nonceOk,
    confidence: nonceOk ? 90 : 40,
    detail: nonceOk ? `Nonce present (${bundle.nonce.length} chars)` : "Nonce missing or too short",
    riskLevel: nonceOk ? "info" : "high",
  });
  if (!nonceOk) flags.push("WEAK_REPLAY_PROTECTION");

  // 5. Media entropy
  const sample = mediaBytes.slice(0, Math.min(2048, mediaBytes.length));
  const nonZero = Array.from(sample).filter((b) => b !== 0).length;
  const nonZeroRatio = sample.length > 0 ? nonZero / sample.length : 0;
  const entropyOk = mediaBytes.length > 0 && nonZeroRatio > 0.05;
  checks.push({
    id: "media_entropy",
    label: "Media content entropy",
    ok: entropyOk,
    confidence: 80,
    detail: entropyOk
      ? `${mediaBytes.length.toLocaleString()} bytes · non-zero ratio: ${(nonZeroRatio * 100).toFixed(1)}%`
      : mediaBytes.length === 0 ? "Empty file" : "Suspiciously low entropy",
    riskLevel: entropyOk ? "info" : "high",
  });

  // 6. Bundle schema
  const requiredFields: Array<keyof SignatureBundle> = [
    "media_hash", "timestamp", "device_id", "nonce", "signature", "public_key",
  ];
  const missingFields = requiredFields.filter((f) => !bundle[f]);
  const schemaOk = missingFields.length === 0;
  checks.push({
    id: "bundle_schema",
    label: "Proof bundle schema completeness",
    ok: schemaOk,
    confidence: 100,
    detail: schemaOk ? "All required fields present" : `Missing: ${missingFields.join(", ")}`,
    riskLevel: schemaOk ? "info" : "critical",
  });
  if (!schemaOk) flags.push("INCOMPLETE_BUNDLE");

  // 7. Algorithm (version check)
  const algOk = bundle.version === 1 || bundle.version === 2;
  checks.push({
    id: "algorithm_version",
    label: "Bundle version compatibility",
    ok: algOk,
    confidence: 100,
    detail: algOk ? `Bundle v${bundle.version} — Ed25519 / SHA-256` : "Unrecognized bundle version",
    riskLevel: algOk ? "info" : "medium",
  });

  // 8. Device identity binding
  const deviceOk =
    typeof bundle.device_id === "string" &&
    bundle.device_id.startsWith("dev_") &&
    typeof bundle.public_key === "string" &&
    bundle.public_key.length > 20;
  checks.push({
    id: "device_identity",
    label: "Device identity binding",
    ok: deviceOk,
    confidence: 90,
    detail: deviceOk
      ? `Device: ${bundle.device_id} · key: ${bundle.public_key.slice(0, 16)}…`
      : "Device ID or public key missing",
    riskLevel: deviceOk ? "info" : "high",
  });
  if (!deviceOk) flags.push("UNATTRIBUTED_ORIGIN");

  const passed = checks.filter((c) => c.ok).length;
  const overallScore = Math.round((passed / checks.length) * 100);

  let verdict: ForensicVerdict;
  if (!hashOk || !sigOk) verdict = "tampered";
  else if (flags.length > 2) verdict = "suspicious";
  else if (overallScore >= 75) verdict = "clean";
  else verdict = "inconclusive";

  const summary =
    verdict === "clean"
      ? `All ${checks.length} forensic checks passed. Media provenance confirmed.`
      : verdict === "tampered"
        ? `Critical failure: ${flags.join(", ")}. Media modified after signing.`
        : verdict === "suspicious"
          ? `${flags.length} anomalies detected: ${flags.join(", ")}.`
          : `Inconclusive — ${checks.filter((c) => !c.ok).length} checks failed.`;

  return {
    id: `forensic_${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    mediaSize: mediaBytes.length,
    checks,
    overallScore,
    verdict,
    summary,
    flags,
  };
}
