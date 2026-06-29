/**
 * Aletheia API Client
 *
 * Typed client for the Aletheia Verification API v2.
 *
 * Unified deployment mode: frontend and backend share one origin.
 * All calls use relative /api/v2/* paths — no VITE_ALETHEIA_API_URL needed.
 * CORS is not required because there is no cross-origin communication.
 *
 * BASE_URL resolution:
 *   - VITE_API_URL env var (set during `npm run dev` or in .env.local to
 *     point at a local or remote backend, e.g. http://localhost:8080)
 *   - Falls back to "" (empty string) which means same-origin — correct
 *     for unified Docker deployment where the Rust backend serves both
 *     the API and the React SPA.
 */

// Use VITE_API_URL if set (local dev pointing at a separate backend),
// otherwise use same-origin (production unified deployment).
const BASE_URL: string = import.meta.env.VITE_API_URL ?? "";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface ApiResult<T> {
  ok:   boolean;
  data: T | null;
  error: string | null;
  /** Server-provided scope disclaimer — always show to users */
  provenanceScopeNote: string;
  requestId?: string;
}

const SCOPE_NOTE =
  "Verification confirms provenance integrity, not independent semantic truth of depicted content.";

async function apiCall<T>(
  path:    string,
  method:  "GET" | "POST",
  body?:   unknown,
  apiKey?: string,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json() as T & { provenance_scope_note?: string; error?: string };
    const scopeNote = (json as Record<string, string>).provenance_scope_note ?? SCOPE_NOTE;

    if (!res.ok) {
      return { ok: false, data: null, error: (json as Record<string, string>).error ?? "Request failed", provenanceScopeNote: scopeNote };
    }

    return { ok: true, data: json, error: null, provenanceScopeNote: scopeNote };
  } catch (e) {
    return { ok: false, data: null, error: String(e), provenanceScopeNote: SCOPE_NOTE };
  }
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export interface ServerVerifyResponse {
  valid:              boolean;
  trust_level:        string;
  trust_score:        number;
  hash_match:         boolean;
  signature_valid:    boolean;
  timestamp_valid:    boolean;
  replay_protected:   boolean;
  recomputed_hash:    string;
  certificate_ref:    string | null;
  checks:             Array<{ label: string; passed: boolean; detail?: string }>;
  provenance_scope_note: string;
}

export async function apiVerify(
  mediaHash: string,
  bundle:    unknown,
  apiKey?:   string,
): Promise<ApiResult<ServerVerifyResponse>> {
  return apiCall<ServerVerifyResponse>("/api/v2/verify", "POST", { asset_hash: mediaHash, bundle }, apiKey);
}

// ─── Attestation challenge ────────────────────────────────────────────────────

export interface ChallengeResponse {
  challenge_nonce: string;
  expires_at:      string;
  ttl_seconds:     number;
}

export async function apiAttestChallenge(
  deviceId:  string,
  platform:  "apple" | "android",
  apiKey?:   string,
): Promise<ApiResult<ChallengeResponse>> {
  return apiCall<ChallengeResponse>("/api/v2/attest/challenge", "POST", { device_id: deviceId, platform }, apiKey);
}

// ─── Create manifest ──────────────────────────────────────────────────────────

export interface ManifestResponse {
  manifest_id:        string;
  capture_hash:       string;
  verification_level: string;
  created_at:         string;
  immutable:          boolean;
  provenance_scope_note: string;
}

export async function apiCreateManifest(
  bundle:         unknown,
  attestationId?: string,
  aiDisclosure?:  string,
  apiKey?:        string,
): Promise<ApiResult<ManifestResponse>> {
  return apiCall<ManifestResponse>("/api/v2/manifest", "POST", {
    bundle, attestation_id: attestationId, ai_disclosure: aiDisclosure,
  }, apiKey);
}

// ─── Anchor ───────────────────────────────────────────────────────────────────

export interface AnchorResponse {
  anchor_id:        string;
  proof_hash:       string;
  transaction_hash: string;
  block_number:     number;
  network:          string;
  confirmations:    number;
  anchored_at:      string;
  explorer_url:     string;
  provenance_scope_note: string;
}

export async function apiAnchor(
  manifestId: string,
  network:    "polygon" | "ethereum" | "base",
  apiKey?:    string,
): Promise<ApiResult<AnchorResponse>> {
  return apiCall<AnchorResponse>("/api/v2/anchor", "POST", { manifest_id: manifestId, network }, apiKey);
}

// ─── Get lineage ──────────────────────────────────────────────────────────────

export async function apiGetLineage(
  id:      string,
  apiKey?: string,
): Promise<ApiResult<unknown>> {
  return apiCall<unknown>(`/api/v2/lineage/${encodeURIComponent(id)}`, "GET", undefined, apiKey);
}

// ─── Get certificate ──────────────────────────────────────────────────────────

export async function apiGetCertificate(
  id:      string,
  apiKey?: string,
): Promise<ApiResult<unknown>> {
  return apiCall<unknown>(`/api/v2/certificate/${encodeURIComponent(id)}`, "GET", undefined, apiKey);
}

// ─── Get audit trail ─────────────────────────────────────────────────────────

export async function apiGetAudit(
  id:      string,
  apiKey?: string,
): Promise<ApiResult<unknown>> {
  return apiCall<unknown>(`/api/v2/audit/${encodeURIComponent(id)}`, "GET", undefined, apiKey);
}

// ─── Mode helpers ────────────────────────────────────────────────────────────

/** True when no explicit API URL override is set (unified deployment) */
export const isServerMode = (): boolean => BASE_URL === "";

/** The configured API base URL (empty string = same-origin) */
export const serverBaseUrl = (): string => BASE_URL;
