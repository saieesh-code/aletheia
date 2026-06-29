/**
 * Aletheia Trust Engine v2 — Provenance-Accurate Terminology
 *
 * IMPORTANT: Trust levels describe provenance integrity states only.
 * They do NOT make claims about semantic truth or objective reality
 * of depicted content.
 */

export type TrustLevel =
  | "PROVENANCE_VERIFIED"
  | "INTEGRITY_CONFIRMED"
  | "LINEAGE_INTACT"
  | "HARDWARE_ATTESTED"
  | "AI_DISCLOSURE_PRESENT"
  | "MODIFIED_TRACEABLE"
  | "BROKEN_PROVENANCE"
  | "UNTRUSTED_SOURCE"
  | "UNKNOWN_SEMANTIC";

export interface TrustLevelConfig {
  label: string;
  shortLabel: string;
  score: number;
  color: string;
  bgColor: string;
  /** What this trust state guarantees */
  guarantees: string;
  /** What this trust state does NOT guarantee */
  caveat: string;
}

export const TRUST_LEVELS: Record<TrustLevel, TrustLevelConfig> = {
  PROVENANCE_VERIFIED: {
    label: "Cryptographic Provenance Verified",
    shortLabel: "Provenance Verified",
    score: 100,
    color: "oklch(0.72 0.19 155)",
    bgColor: "oklch(0.72 0.19 155 / 0.10)",
    guarantees: "The uploaded media matches its signed cryptographic provenance record. Cryptographic integrity and provenance chain successfully verified.",
    caveat: "Verification confirms provenance integrity, not independent semantic truth of depicted content.",
  },
  INTEGRITY_CONFIRMED: {
    label: "Integrity Confirmed",
    shortLabel: "Integrity Confirmed",
    score: 88,
    color: "oklch(0.75 0.17 155)",
    bgColor: "oklch(0.75 0.17 155 / 0.10)",
    guarantees: "Cryptographic hash and signature match. The file has not been altered since signing.",
    caveat: "Provenance chain completeness could not be fully established.",
  },
  LINEAGE_INTACT: {
    label: "Lineage Intact",
    shortLabel: "Lineage Intact",
    score: 82,
    color: "oklch(0.77 0.15 155)",
    bgColor: "oklch(0.77 0.15 155 / 0.10)",
    guarantees: "Full provenance chain verified from capture through all declared transformations.",
    caveat: "Semantic truth of depicted scenes is outside the scope of provenance verification.",
  },
  HARDWARE_ATTESTED: {
    label: "Hardware Attested",
    shortLabel: "Hardware Attested",
    score: 95,
    color: "oklch(0.72 0.19 155)",
    bgColor: "oklch(0.72 0.19 155 / 0.10)",
    guarantees: "Signing key originated in verified hardware (Secure Enclave / StrongBox). Device attestation validated.",
    caveat: "Hardware attestation verifies device integrity, not the semantic truth of captured content.",
  },
  AI_DISCLOSURE_PRESENT: {
    label: "AI Disclosure Present",
    shortLabel: "AI Disclosure",
    score: 70,
    color: "oklch(0.72 0.20 310)",
    bgColor: "oklch(0.72 0.20 310 / 0.10)",
    guarantees: "Creator has declared AI involvement in this media's provenance record.",
    caveat: "Disclosure is a self-declaration and cannot be independently verified by provenance alone.",
  },
  MODIFIED_TRACEABLE: {
    label: "Modified — Lineage Traceable",
    shortLabel: "Modified — Traceable",
    score: 55,
    color: "oklch(0.78 0.18 65)",
    bgColor: "oklch(0.78 0.18 65 / 0.10)",
    guarantees: "Post-capture modifications detected. Modification history is signed and traceable in the lineage chain.",
    caveat: "The nature or intent of modifications cannot be determined from provenance data alone.",
  },
  BROKEN_PROVENANCE: {
    label: "Provenance Chain Broken",
    shortLabel: "Broken Provenance",
    score: 20,
    color: "oklch(0.70 0.22 35)",
    bgColor: "oklch(0.70 0.22 35 / 0.10)",
    guarantees: "N/A — provenance chain cannot be validated.",
    caveat: "Media hash does not match the signed record. The file may have been modified after signing, or the bundle may have been tampered with.",
  },
  UNTRUSTED_SOURCE: {
    label: "Untrusted — Verification Failed",
    shortLabel: "Untrusted Source",
    score: 0,
    color: "oklch(0.65 0.25 25)",
    bgColor: "oklch(0.65 0.25 25 / 0.10)",
    guarantees: "N/A — multiple critical verification checks failed.",
    caveat: "Cannot establish any verifiable provenance relationship between the media and the supplied bundle.",
  },
  UNKNOWN_SEMANTIC: {
    label: "Unknown Semantic Authenticity",
    shortLabel: "Unknown Semantic",
    score: 45,
    color: "oklch(0.68 0.08 250)",
    bgColor: "oklch(0.68 0.08 250 / 0.10)",
    guarantees: "Provenance data available but semantic context is undeclared or ambiguous.",
    caveat: "The relationship between the captured content and depicted reality cannot be established from provenance alone.",
  },
};

export type AIDisclosure =
  | "declared_camera_original"
  | "declared_ai_generated"
  | "declared_ai_modified"
  | "undeclared_origin"
  | "unknown_origin";

export const AI_DISCLOSURE_LABELS: Record<AIDisclosure, string> = {
  declared_camera_original: "Declared: Camera Original",
  declared_ai_generated:    "Declared: AI Generated",
  declared_ai_modified:     "Declared: AI Modified",
  undeclared_origin:        "Origin Undeclared",
  unknown_origin:           "Origin Unknown",
};

export interface TrustInput {
  hashMatch: boolean;
  signatureValid: boolean;
  deviceIdConsistent: boolean;
  timestampValid: boolean;
  aiDisclosure?: AIDisclosure | string;
  lineageIntact?: boolean;
  hardwareAttested?: boolean;
}

export function computeTrustLevel(input: TrustInput): TrustLevel {
  if (!input.hashMatch && !input.signatureValid) return "UNTRUSTED_SOURCE";
  if (!input.hashMatch) return "BROKEN_PROVENANCE";
  if (!input.signatureValid) return "MODIFIED_TRACEABLE";
  if (input.hardwareAttested) return "HARDWARE_ATTESTED";
  if (input.aiDisclosure && input.aiDisclosure !== "declared_camera_original" && input.aiDisclosure !== "camera_original") return "AI_DISCLOSURE_PRESENT";
  if (input.lineageIntact) return "LINEAGE_INTACT";
  if (!input.deviceIdConsistent || !input.timestampValid) return "INTEGRITY_CONFIRMED";
  return "PROVENANCE_VERIFIED";
}

export function computeTrustScore(passed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((passed / total) * 100);
}

/** The legally cautious disclaimer that must appear near verification results */
export const PROVENANCE_DISCLAIMER =
  "Verification confirms provenance integrity, not independent semantic truth of depicted content.";

/** Panel content for "what Aletheia can and cannot verify" */
export const SCOPE_PANEL = {
  canVerify: [
    "Media cryptographic integrity (SHA-256 hash match)",
    "Digital signature validity (Ed25519)",
    "Device identity binding",
    "Timestamp consistency",
    "Provenance lineage continuity",
    "Declared transformations and modifications",
    "Ledger anchor existence",
  ],
  cannotVerify: [
    "Whether depicted events are objectively real",
    "Whether media was AI-generated before signing",
    "Whether scenes were staged or manipulated pre-capture",
    "Whether sensor inputs were spoofed",
    "Whether GPS coordinates reflect actual capture location",
    "Whether the declaring device was operated by its registered owner",
    "Semantic truth of any depicted content",
  ],
};
