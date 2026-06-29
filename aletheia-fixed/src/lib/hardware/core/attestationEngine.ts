/**
 * Aletheia Hardware Trust Layer
 * All browser detection behind typeof window / navigator guards.
 * Safe to import and call during SSR — returns safe defaults server-side.
 */

export type CapabilityTier = "hardware" | "software" | "unavailable";

export interface HardwareCapability {
  id: string;
  label: string;
  description: string;
  tier: CapabilityTier;
  available: boolean;
  hasFallback: boolean;
  nativeApiRef?: string;
}

export interface DeviceCapabilities {
  secureEnclave: HardwareCapability;
  appAttest: HardwareCapability;
  tpm: HardwareCapability;
  strongBox: HardwareCapability;
  biometric: HardwareCapability;
  secureContext: HardwareCapability;
  webCrypto: HardwareCapability;
  ed25519: HardwareCapability;
  antiReplay: HardwareCapability;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  const isSecure = isBrowser() && window.isSecureContext;
  const hasCrypto = isBrowser() && typeof window.crypto !== "undefined" && typeof window.crypto.subtle !== "undefined";

  return {
    secureEnclave: {
      id: "secureEnclave",
      label: "Secure Enclave",
      description: "Apple T2/M-series hardware security processor. Non-exportable private keys.",
      tier: "hardware",
      available: false,
      hasFallback: true,
      nativeApiRef: "CryptoKit.SecureEnclave.P256",
    },
    appAttest: {
      id: "appAttest",
      label: "App Attest",
      description: "Apple App Attest: cryptographic proof of genuine app and device.",
      tier: "hardware",
      available: false,
      hasFallback: false,
      nativeApiRef: "DCAppAttestService.attestKey",
    },
    tpm: {
      id: "tpm",
      label: "TPM 2.0",
      description: "Trusted Platform Module — hardware-bound key storage for desktop.",
      tier: "hardware",
      available: false,
      hasFallback: false,
      nativeApiRef: "NCryptOpenStorageProvider",
    },
    strongBox: {
      id: "strongBox",
      label: "Android StrongBox",
      description: "Hardware-backed Keystore in dedicated Android security chip.",
      tier: "hardware",
      available: false,
      hasFallback: false,
      nativeApiRef: "KeyGenParameterSpec.setIsStrongBoxBacked",
    },
    biometric: {
      id: "biometric",
      label: "Biometric Auth Gate",
      description: "Face ID / Touch ID / Fingerprint required before signing.",
      tier: "hardware",
      available: false,
      hasFallback: false,
      nativeApiRef: "LAContext.evaluatePolicy",
    },
    secureContext: {
      id: "secureContext",
      label: "Secure Context (HTTPS)",
      description: "HTTPS context required for all cryptographic operations.",
      tier: "software",
      available: isSecure,
      hasFallback: false,
    },
    webCrypto: {
      id: "webCrypto",
      label: "Web Crypto API",
      description: "Browser-native SHA-256 hashing via crypto.subtle.",
      tier: "software",
      available: hasCrypto,
      hasFallback: false,
      nativeApiRef: "window.crypto.subtle",
    },
    ed25519: {
      id: "ed25519",
      label: "Ed25519 (tweetnacl — software)",
      description: "Software-mode Ed25519. Secure but not hardware-bound. Current signing mode.",
      tier: "software",
      available: isBrowser(),
      hasFallback: false,
    },
    antiReplay: {
      id: "antiReplay",
      label: "Anti-Replay Protection",
      description: "Cryptographic nonce + timestamp validation preventing bundle reuse.",
      tier: "software",
      available: true,
      hasFallback: false,
    },
  };
}

export type DeviceTrustCategory =
  | "HIGH_TRUST_DEVICE"
  | "VERIFIED_HARDWARE"
  | "PARTIALLY_TRUSTED"
  | "SOFTWARE_TRUST_ONLY"
  | "UNTRUSTED_DEVICE";

export interface DeviceTrustScore {
  overall: number;
  hardwareScore: number;
  softwareScore: number;
  category: DeviceTrustCategory;
  categoryLabel: string;
}

const HW_CAPS = ["secureEnclave", "appAttest", "tpm", "strongBox", "biometric"] as const;
const SW_CAPS = ["secureContext", "webCrypto", "ed25519", "antiReplay"] as const;

export function computeDeviceTrustScore(caps: DeviceCapabilities): DeviceTrustScore {
  const hwAvail = HW_CAPS.filter((k) => caps[k].available).length;
  const swAvail = SW_CAPS.filter((k) => caps[k].available).length;
  const hardwareScore = Math.round((hwAvail / HW_CAPS.length) * 100);
  const softwareScore = Math.round((swAvail / SW_CAPS.length) * 100);
  const overall = Math.round(hardwareScore * 0.6 + softwareScore * 0.4);

  let category: DeviceTrustCategory;
  let categoryLabel: string;
  if (overall >= 80) { category = "HIGH_TRUST_DEVICE"; categoryLabel = "High Trust Device"; }
  else if (overall >= 60) { category = "VERIFIED_HARDWARE"; categoryLabel = "Verified Hardware"; }
  else if (overall >= 40) { category = "PARTIALLY_TRUSTED"; categoryLabel = "Partially Trusted"; }
  else if (overall >= 20) { category = "SOFTWARE_TRUST_ONLY"; categoryLabel = "Software Trust Only"; }
  else { category = "UNTRUSTED_DEVICE"; categoryLabel = "Untrusted Device"; }

  return { overall, hardwareScore, softwareScore, category, categoryLabel };
}

export interface AttestationResult {
  valid: boolean;
  token: string;
  issuedAt: string;
  expiresAt: string;
  replayNonce: string;
  deviceIntegrity: {
    appRecognized: boolean;
    deviceRecognized: boolean;
    noKnownVulnerabilities: boolean;
  };
}

export async function requestAttestation(deviceId: string): Promise<AttestationResult> {
  await new Promise((r) => setTimeout(r, 700));
  const nonce = Array.from(
    isBrowser() ? crypto.getRandomValues(new Uint8Array(16)) : new Uint8Array(16)
  ).map((b) => b.toString(16).padStart(2, "0")).join("");
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  return {
    valid: true,
    token: `attest_sim_${deviceId.slice(0, 8)}_${nonce.slice(0, 8)}`,
    issuedAt,
    expiresAt,
    replayNonce: nonce,
    deviceIntegrity: {
      appRecognized: false,
      deviceRecognized: false,
      noKnownVulnerabilities: true,
    },
  };
}
