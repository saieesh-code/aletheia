import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Nav } from "@/components/aletheia/Nav";
import {
  Code2, Server, Shield, GitBranch, Database,
  Anchor, FileCheck, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, Copy, Check
} from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "API Reference — Aletheia" },
      { name: "description", content: "Aletheia Verification API — cryptographic provenance, attestation, lineage, and certificate endpoints." },
    ],
  }),
  component: DocsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Endpoint {
  method: "POST" | "GET" | "DELETE";
  path: string;
  title: string;
  description: string;
  requestBody?: object;
  response: object;
  trustLevel?: string;
  notes?: string[];
}

interface ApiSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  endpoints: Endpoint[];
}

// ─── API Sections ─────────────────────────────────────────────────────────────
const API_SECTIONS: ApiSection[] = [
  {
    id: "verify",
    icon: <Shield className="w-4 h-4 text-primary" />,
    title: "Verification",
    subtitle: "Cryptographic provenance verification",
    endpoints: [
      {
        method: "POST", path: "/api/v2/verify",
        title: "Verify media provenance",
        description: "Verify a media file against its signed Aletheia proof bundle. Runs all cryptographic checks and returns a structured trust result with provenance scope disclaimer.",
        requestBody: {
          media_hash: "string — SHA-256 hex of media bytes (preferred for large files)",
          media_b64: "string? — Base64-encoded media bytes (max 50 MB; omit if media_hash provided)",
          bundle: "object — Signed Aletheia proof bundle (v1 or v2)",
          run_forensic_audit: "boolean? — Run provenance audit checks (default: true)"
        },
        response: {
          valid: "boolean",
          trust_level: "PROVENANCE_VERIFIED | INTEGRITY_CONFIRMED | BROKEN_PROVENANCE | UNTRUSTED_SOURCE | ...",
          trust_score: "number (0–100)",
          hash_match: "boolean",
          signature_valid: "boolean",
          timestamp_valid: "boolean",
          replay_protected: "boolean",
          recomputed_hash: "string",
          certificate_id: "string — reference to generated certificate",
          provenance_scope_note: "string — mandatory disclaimer",
          checks: "Array<{ label: string; passed: boolean }>",
          forensic_audit: "ForensicAudit? — if requested"
        },
        notes: [
          "Always check provenance_scope_note — verification confirms integrity, not semantic truth",
          "hash_match: false indicates content was modified after signing",
          "For files > 10 MB, pre-compute SHA-256 client-side and send media_hash only",
          "Replay protection: each bundle nonce is recorded; resubmitting the same bundle returns replay_detected: true"
        ]
      }
    ]
  },
  {
    id: "attest",
    icon: <Server className="w-4 h-4 text-primary" />,
    title: "Attestation",
    subtitle: "Hardware device attestation validation",
    endpoints: [
      {
        method: "POST", path: "/api/v2/attest",
        title: "Validate device attestation",
        description: "Validates Apple App Attest or Android Play Integrity tokens server-side. This is the critical security gate — browser-side attestation can be bypassed; server-side validation is mandatory for hardware trust.",
        requestBody: {
          platform: "\"apple\" | \"android\"",
          device_id: "string — device identifier",
          attestation_token: "string — App Attest / Play Integrity token",
          challenge_nonce: "string — server-issued challenge (must be requested first)",
          key_id: "string? — Apple App Attest key ID"
        },
        response: {
          valid: "boolean",
          attestation_id: "string — opaque reference stored server-side",
          device_trust_level: "\"hardware_verified\" | \"software_verified\" | \"unattested\" | \"failed\"",
          hardware_bound: "boolean",
          expires_at: "string — ISO 8601",
          revoked: "boolean"
        },
        notes: [
          "Challenge nonce must be fetched from POST /api/v2/attest/challenge first",
          "Apple: validates CBOR attestation object, certificate chain to Apple root CA, and nonce binding",
          "Android: validates Play Integrity API token against Google servers",
          "attestation_id is stored in the Aletheia attestation registry and referenced in manifests"
        ]
      },
      {
        method: "POST", path: "/api/v2/attest/challenge",
        title: "Request attestation challenge",
        description: "Issues a server-side cryptographic challenge nonce for App Attest or Play Integrity. Must be called before attestation to prevent replay attacks.",
        requestBody: { device_id: "string", platform: "\"apple\" | \"android\"" },
        response: { challenge_nonce: "string", expires_at: "string", ttl_seconds: "number" }
      }
    ]
  },
  {
    id: "manifest",
    icon: <FileCheck className="w-4 h-4 text-primary" />,
    title: "Manifests",
    subtitle: "Immutable verifiable capture manifests",
    endpoints: [
      {
        method: "POST", path: "/api/v2/manifest",
        title: "Create provenance manifest",
        description: "Creates an immutable Verifiable Capture Manifest from a signed bundle and optional attestation reference. Manifests are append-only — they cannot be updated or deleted.",
        requestBody: {
          bundle: "SignatureBundle",
          attestation_id: "string? — from attestation validation",
          sensor_metadata: "SensorMetadata? — camera make/model/exposure",
          lineage_parent: "string? — parent manifest ID",
          ai_disclosure: "\"declared_camera_original\" | \"declared_ai_generated\" | ..."
        },
        response: {
          manifest_id: "string",
          capture_hash: "string",
          verification_level: "\"hardware_verified\" | \"software_verified\" | \"unattested\"",
          created_at: "string",
          immutable: "true"
        }
      },
      {
        method: "GET", path: "/api/v2/manifest/:id",
        title: "Retrieve manifest",
        description: "Retrieve an immutable provenance manifest by ID. Returns the full manifest including all embedded provenance fields.",
        requestBody: undefined,
        response: {
          manifest_id: "string",
          capture_hash: "string",
          device_id: "string",
          capture_timestamp: "string",
          gps: "{ lat, lon } | null",
          verification_level: "string",
          ledger_anchor: "LedgerAnchor | null",
          lineage_parent: "string | null",
          ai_disclosure: "string"
        }
      }
    ]
  },
  {
    id: "lineage",
    icon: <GitBranch className="w-4 h-4 text-primary" />,
    title: "Lineage",
    subtitle: "Immutable provenance DAG — \"Git for reality\"",
    endpoints: [
      {
        method: "POST", path: "/api/v2/lineage",
        title: "Add lineage node",
        description: "Append a signed transformation node to the provenance lineage DAG. Each transformation (crop, compress, redact, export) creates a child node that pins its parent's hash. Creates an auditable chain of custody from original capture to current form.",
        requestBody: {
          parent_id: "string — parent lineage node ID",
          media_hash: "string — SHA-256 of transformed media",
          operation: "\"crop\" | \"compress\" | \"resize\" | \"enhance\" | \"redact\" | \"export\" | \"share\"",
          operation_metadata: "object? — operation-specific context",
          device_signature: "string — Ed25519 / ECDSA signature",
          device_id: "string",
          nonce: "string"
        },
        response: {
          node_id: "string",
          parent_id: "string",
          previous_hash: "string",
          media_hash: "string",
          operation: "string",
          timestamp: "string",
          chain_valid: "boolean"
        }
      },
      {
        method: "GET", path: "/api/v2/lineage/:id",
        title: "Get lineage chain",
        description: "Retrieve the full provenance lineage chain for a given root or node ID. Returns the ordered DAG from root capture to the specified node.",
        requestBody: undefined,
        response: {
          root_id: "string",
          nodes: "LineageNode[]",
          chain_valid: "boolean",
          summary: "\"Original Capture → Crop → Compress → Export\"",
          depth: "number"
        }
      }
    ]
  },
  {
    id: "anchor",
    icon: <Anchor className="w-4 h-4 text-primary" />,
    title: "Anchoring",
    subtitle: "Immutable blockchain timestamp anchoring (Polygon)",
    endpoints: [
      {
        method: "POST", path: "/api/v2/anchor",
        title: "Anchor proof hash",
        description: "Anchors a manifest proof hash to the Polygon blockchain for immutable public timestamp notarization. Only the hash digest is anchored — never raw media. Gas is managed server-side.",
        requestBody: {
          manifest_id: "string — manifest to anchor",
          network: "\"polygon\" | \"ethereum\" | \"base\"",
          priority: "\"standard\" | \"fast\""
        },
        response: {
          anchor_id: "string",
          proof_hash: "string — SHA-256(manifest_id + device_id + timestamp)",
          transaction_hash: "string",
          block_number: "number",
          network: "string",
          confirmations: "number",
          anchored_at: "string",
          explorer_url: "string"
        },
        notes: [
          "Only proof hashes are anchored on-chain — never raw media or PII",
          "Recommended: Polygon for cost efficiency (~$0.001 per anchor)",
          "Ethereum available for highest-credibility anchoring (~$0.12 per anchor)",
          "Base available as cost-efficient L2 alternative (~$0.003)",
          "Transaction hash provides publicly verifiable timestamp without Aletheia infrastructure"
        ]
      }
    ]
  },
  {
    id: "certificate",
    icon: <FileCheck className="w-4 h-4 text-primary" />,
    title: "Certificates",
    subtitle: "Signed provenance certificates and audit reports",
    endpoints: [
      {
        method: "GET", path: "/api/v2/certificate/:id",
        title: "Retrieve certificate",
        description: "Retrieve a signed provenance certificate by certificate ID. Certificates are generated after successful verification and include a scope disclaimer mandating their proper interpretation.",
        requestBody: undefined,
        response: {
          certificate_id: "string",
          certificate_class: "\"PROVENANCE_CERTIFICATE\" | \"INTEGRITY_REPORT\" | \"FORENSIC_AUDIT\"",
          issued_at: "string",
          subject: "CertificateSubject",
          verification: "CertificateVerification",
          forensic_audit: "CertificateForensicSection?",
          scope_notes: "ScopeNotes",
          certificate_hash: "string — SHA-256 of certificate body",
          format: "\"json\" | \"cbor\" | \"text\""
        }
      },
      {
        method: "GET", path: "/api/v2/certificate/:id/download",
        title: "Download certificate",
        description: "Download a certificate in the requested format.",
        requestBody: undefined,
        response: { format: "\"json\" | \"cbor\" | \"text\"", content_type: "\"application/json\" | \"application/cbor\" | \"text/plain\"" }
      }
    ]
  },
  {
    id: "audit",
    icon: <Database className="w-4 h-4 text-primary" />,
    title: "Audit",
    subtitle: "Immutable verification audit trail",
    endpoints: [
      {
        method: "GET", path: "/api/v2/audit/:id",
        title: "Get audit trail",
        description: "Retrieve the complete immutable audit trail for a manifest, certificate, or device. All events are timestamped, attributable, and append-only.",
        requestBody: undefined,
        response: {
          subject_id: "string",
          events: "AuditEvent[]",
          event_count: "number",
          merkle_root: "string — Merkle root of all event hashes"
        }
      }
    ]
  }
];

// ─── Components ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-secondary transition"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    POST: "text-primary bg-primary/10 border-primary/30",
    GET:  "text-blue-400 bg-blue-400/10 border-blue-400/30",
    DELETE: "text-destructive bg-destructive/10 border-destructive/30",
  };
  return (
    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${colors[method] ?? ""}`}>
      {method}
    </span>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition text-left"
      >
        <MethodBadge method={ep.method} />
        <code className="text-sm font-mono text-foreground flex-1">{ep.path}</code>
        <span className="text-sm text-muted-foreground hidden sm:block flex-shrink-0 mr-2">{ep.title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{ep.description}</p>
          {ep.requestBody && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Request body</div>
              <div className="rounded-md bg-secondary/40 border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs text-muted-foreground">application/json</span>
                  <CopyButton text={JSON.stringify(ep.requestBody, null, 2)} />
                </div>
                <pre className="text-xs font-mono p-3 overflow-auto text-muted-foreground leading-relaxed">
                  {JSON.stringify(ep.requestBody, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Response</div>
            <div className="rounded-md bg-secondary/40 border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">application/json</span>
                <CopyButton text={JSON.stringify(ep.response, null, 2)} />
              </div>
              <pre className="text-xs font-mono p-3 overflow-auto text-muted-foreground leading-relaxed">
                {JSON.stringify(ep.response, null, 2)}
              </pre>
            </div>
          </div>
          {ep.notes && ep.notes.length > 0 && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-3">
              <div className="text-xs font-medium text-amber-500 mb-2">Notes</div>
              <ul className="space-y-1">
                {ep.notes.map((n, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5 flex-shrink-0">·</span>{n}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
  return (
    <div className="rounded-md bg-secondary/40 border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="text-xs font-mono p-4 overflow-auto text-muted-foreground leading-relaxed">{code}</pre>
    </div>
  );
}

function DocsPage() {
  const [activeSection, setActiveSection] = useState("verify");

  const verifyExample = `curl -X POST https://api.aletheia.io/v2/verify \\
  -H "Authorization: Bearer <api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "media_hash": "a3f5c2d8e1b4...",
    "bundle": {
      "version": 2,
      "media_hash": "a3f5c2d8e1b4...",
      "timestamp": "2025-01-15T10:30:00Z",
      "device_id": "dev_1234567890abcdef",
      "signature": "base64encodedSignature...",
      "public_key": "base64encodedPublicKey...",
      "nonce": "base64nonce..."
    }
  }'`;

  const responseExample = `{
  "valid": true,
  "trust_level": "PROVENANCE_VERIFIED",
  "trust_score": 100,
  "hash_match": true,
  "signature_valid": true,
  "timestamp_valid": true,
  "replay_protected": true,
  "certificate_id": "cert_lx8k2m",
  "provenance_scope_note": "Verification confirms provenance integrity,
    not independent semantic truth of depicted content.",
  "checks": [
    { "label": "SHA-256 media hash matches bundle", "passed": true },
    { "label": "Ed25519 signature valid", "passed": true }
  ]
}`;

  const sdkExample = `import { AletheiaSDK } from "@aletheia/sdk";

const sdk = new AletheiaSDK({ apiKey: process.env.ALETHEIA_API_KEY });

// Verify a media file
const result = await sdk.verification.verify({
  mediaHash: sha256(mediaBytes),
  bundle: proofBundle,
});

console.log(result.trustLevel);     // "PROVENANCE_VERIFIED"
console.log(result.hashMatch);      // true
console.log(result.scopeNote);      // provenance disclaimer
console.log(result.certificateId);  // "cert_lx8k2m"

// Get the certificate
const cert = await sdk.certificates.get(result.certificateId);
console.log(cert.verificationLevel); // "software_verified"`;

  const trustStates = [
    { state: "PROVENANCE_VERIFIED",  color: "text-primary",     desc: "All cryptographic checks passed. Hash + signature valid." },
    { state: "INTEGRITY_CONFIRMED",  color: "text-primary",     desc: "Hash and signature match. Chain completeness not established." },
    { state: "HARDWARE_ATTESTED",    color: "text-primary",     desc: "Secure Enclave / StrongBox key + device attestation confirmed." },
    { state: "LINEAGE_INTACT",       color: "text-primary",     desc: "Full provenance DAG verified from capture to current form." },
    { state: "AI_DISCLOSURE_PRESENT",color: "oklch(0.72 0.20 310) text-[oklch(0.72_0.20_310)]", desc: "Creator declared AI involvement in provenance record." },
    { state: "MODIFIED_TRACEABLE",   color: "text-yellow-500",  desc: "Post-capture modifications detected. Lineage is traceable." },
    { state: "BROKEN_PROVENANCE",    color: "text-destructive", desc: "Hash mismatch. Content modified after signing." },
    { state: "UNTRUSTED_SOURCE",     color: "text-destructive", desc: "Multiple critical verification checks failed." },
    { state: "UNKNOWN_SEMANTIC",     color: "text-muted-foreground", desc: "Provenance available; semantic context undeclared or ambiguous." },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-[220px_1fr] gap-8">

          {/* Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 px-2">
                API Reference
              </div>
              {API_SECTIONS.map(s => (
                <button key={s.id} onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-left transition ${activeSection === s.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {s.icon}{s.title}
                </button>
              ))}
              <div className="pt-4 border-t border-border mt-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 px-2">Resources</div>
                {[
                  { id: "quickstart", label: "Quick start" },
                  { id: "trustlevels", label: "Trust states" },
                  { id: "scope",      label: "Scope & limits" },
                  { id: "sdk",        label: "SDK examples" },
                ].map(r => (
                  <button key={r.id} onClick={() => setActiveSection(r.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-left transition ${activeSection === r.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0 space-y-8">
            {/* Header */}
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">API Reference</h1>
              <p className="mt-2 text-muted-foreground max-w-2xl">
                Aletheia Verification API v2 — cryptographic provenance, hardware attestation,
                immutable lineage, and certificate endpoints.
              </p>
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <code className="text-xs font-mono bg-card border border-border px-3 py-1.5 rounded">
                  Base URL: https://api.aletheia.io/v2
                </code>
                <span className="text-xs text-muted-foreground border border-border px-3 py-1.5 rounded">
                  Auth: Bearer token · JSON · TLS 1.3
                </span>
              </div>
            </div>

            {/* Quick start */}
            {(activeSection === "quickstart" || activeSection === "verify") && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-primary" /> Quick start
                </h2>
                <div className="rounded-lg border border-border bg-card p-5 mb-4">
                  <div className="text-sm text-muted-foreground leading-relaxed mb-4">
                    Verify a signed media file in one API call. The response includes a
                    mandatory <code className="text-foreground">provenance_scope_note</code> field
                    that must be surfaced to end users.
                  </div>
                  <CodeBlock code={verifyExample} lang="bash — POST /api/v2/verify" />
                  <div className="mt-4">
                    <CodeBlock code={responseExample} lang="json — 200 OK" />
                  </div>
                </div>
              </div>
            )}

            {/* API endpoint sections */}
            {API_SECTIONS.filter(s => activeSection === s.id || activeSection === "verify" && s.id === "verify").map(section => (
              <div key={section.id}>
                <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                  {section.icon}{section.title}
                </h2>
                <p className="text-sm text-muted-foreground mb-4">{section.subtitle}</p>
                <div className="space-y-3">
                  {section.endpoints.map(ep => <EndpointCard key={ep.path} ep={ep} />)}
                </div>
              </div>
            ))}

            {/* Trust levels reference */}
            {activeSection === "trustlevels" && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" /> Trust states
                </h2>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground mb-5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  Trust states describe provenance integrity only — not semantic truth of depicted content.
                  Never use REAL / FAKE in consumer interfaces.
                </div>
                <div className="space-y-2">
                  {trustStates.map(ts => (
                    <div key={ts.state} className="rounded-md border border-border bg-card px-4 py-3 flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div>
                        <code className={`text-xs font-mono font-semibold ${ts.color.startsWith("text-") ? ts.color : ""}`}>{ts.state}</code>
                        <p className="text-xs text-muted-foreground mt-0.5">{ts.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scope */}
            {activeSection === "scope" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Scope & limitations</h2>
                <div className="grid md:grid-cols-2 gap-5">
                  <div className="rounded-lg border border-border bg-card p-5">
                    <div className="font-medium text-sm mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" /> What Aletheia verifies
                    </div>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {["SHA-256 cryptographic hash integrity","Ed25519 / ECDSA digital signature validity","Device identity binding","Timestamp validity and non-future constraint","Nonce replay protection","Provenance lineage continuity","Blockchain anchor existence"].map(i => (
                        <li key={i} className="flex items-start gap-1.5"><span className="text-primary">·</span>{i}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-5">
                    <div className="font-medium text-sm mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> What Aletheia cannot verify
                    </div>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {["Semantic truth of depicted content","Whether events actually occurred","Whether scenes were staged","AI generation before signing","Sensor input spoofing","GPS coordinate authenticity"].map(i => (
                        <li key={i} className="flex items-start gap-1.5"><span className="text-amber-500">·</span>{i}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-4 rounded-md border border-border bg-card p-4 text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Mandatory disclaimer: </strong>
                  All API responses include a <code>provenance_scope_note</code> field containing:
                  "Verification confirms provenance integrity, not independent semantic truth of depicted content."
                  Consumer-facing integrations MUST surface this disclaimer alongside verification results.
                </div>
              </div>
            )}

            {/* SDK */}
            {activeSection === "sdk" && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-primary" /> SDK examples
                </h2>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium mb-2">JavaScript / TypeScript</div>
                    <CodeBlock code={sdkExample} lang="typescript" />
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-2">Rate limits</div>
                    <div className="rounded-md border border-border bg-card p-4 space-y-2 text-xs text-muted-foreground">
                      {[
                        ["POST /verify",           "1,000 req/min per API key"],
                        ["POST /attest",            "100 req/min per device_id"],
                        ["POST /anchor",            "10 req/min (gas cost management)"],
                        ["GET /certificate/:id",    "5,000 req/min"],
                        ["GET /lineage/:id",        "2,000 req/min"],
                      ].map(([ep, limit]) => (
                        <div key={ep as string} className="flex justify-between">
                          <code className="font-mono">{ep}</code>
                          <span>{limit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-2">Backend architecture (production)</div>
                    <div className="rounded-md border border-border bg-card p-4 text-xs text-muted-foreground space-y-1 leading-relaxed">
                      <div>Recommended stack: <strong className="text-foreground">Rust + Axum + Tokio</strong></div>
                      <div>Database: <strong className="text-foreground">PostgreSQL 15+ (append-only manifests table)</strong></div>
                      <div>Cache: <strong className="text-foreground">Redis (nonce store, rate limiting)</strong></div>
                      <div>Anchoring: <strong className="text-foreground">Polygon via ethers-rs + AnchorContract.sol</strong></div>
                      <div>Attestation: <strong className="text-foreground">Apple App Attest / Play Integrity validated server-side</strong></div>
                      <div className="pt-2">See <code>BACKEND_ARCHITECTURE.md</code> for the complete Rust implementation spec.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* All sections when none specifically selected */}
            {!["quickstart","verify","trustlevels","scope","sdk"].includes(activeSection) && activeSection !== "verify" && (
              (() => {
                const section = API_SECTIONS.find(s => s.id === activeSection);
                if (!section) return null;
                return (
                  <div>
                    <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                      {section.icon}{section.title}
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">{section.subtitle}</p>
                    <div className="space-y-3">
                      {section.endpoints.map(ep => <EndpointCard key={ep.path} ep={ep} />)}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
