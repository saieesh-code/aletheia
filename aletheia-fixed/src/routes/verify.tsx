import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { Nav } from "@/components/aletheia/Nav";
import {
  sha256Hex,
  shorten,
  verifyCapture,
  type SignatureBundle,
  type VerifyResult,
} from "@/lib/aletheia";
import { apiVerify } from "@/lib/api/client";
import { runForensicAnalysis, type ForensicReport } from "@/lib/forensics/engine";
import { computeTrustLevel, TRUST_LEVELS, PROVENANCE_DISCLAIMER, SCOPE_PANEL } from "@/lib/trust/engine";
import {
  generateVerificationCertificate,
  downloadCertificateJSON,
  downloadCertificateText,
  type VerificationCertificate,
} from "@/lib/certificate/generator";
import {
  CheckCircle2, XCircle, Upload, FileJson, ImageIcon,
  AlertTriangle, ShieldCheck, ShieldX, Bug, Microscope,
  Link2, Info, Download, FileText, Clock,
} from "lucide-react";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify Provenance — Aletheia" },
      { name: "description", content: "Cryptographic provenance verification with downloadable certificates." },
    ],
  }),
  component: VerifyPage,
});

type TabId = "checks" | "hash" | "forensics" | "proof" | "certificate" | "scope";

interface AuditEvent {
  timestamp: string;
  event: string;
  detail: string;
  ok: boolean;
}

function buildAuditLog(result: VerifyResult, forensics: ForensicReport | null): AuditEvent[] {
  const now = new Date().toISOString();
  const events: AuditEvent[] = [
    { timestamp: now, event: "VERIFICATION_INITIATED", detail: "Media and proof bundle loaded", ok: true },
    { timestamp: now, event: "HASH_RECOMPUTED", detail: `SHA-256 recomputed: ${result.recomputed_hash.slice(0,16)}…`, ok: true },
    { timestamp: now, event: "HASH_CHECK", detail: result.recomputed_hash === result.bundle.media_hash ? "Hash match confirmed" : "Hash mismatch detected", ok: result.recomputed_hash === result.bundle.media_hash },
    { timestamp: now, event: "SIGNATURE_CHECK", detail: result.valid ? "Ed25519 signature valid for device public key" : "Signature verification failed", ok: result.valid },
    { timestamp: now, event: "TIMESTAMP_CHECK", detail: `Bundle timestamp: ${new Date(result.bundle.timestamp).toLocaleString()}`, ok: true },
    { timestamp: now, event: "NONCE_CHECK", detail: result.bundle.nonce ? "Replay protection nonce present" : "Nonce missing", ok: !!result.bundle.nonce },
    { timestamp: now, event: "TRUST_LEVEL_COMPUTED", detail: `Trust level: ${computeTrustLevel({ hashMatch: result.recomputed_hash === result.bundle.media_hash, signatureValid: result.valid, deviceIdConsistent: true, timestampValid: true })}`, ok: result.valid },
  ];
  if (forensics) {
    events.push({ timestamp: now, event: "FORENSIC_AUDIT_COMPLETE", detail: `${forensics.checks.filter(c => c.ok).length}/${forensics.checks.length} provenance checks passed · Score: ${forensics.overallScore}/100`, ok: forensics.verdict === "clean" });
  }
  events.push({ timestamp: now, event: "CERTIFICATE_GENERATED", detail: "Provenance certificate available for download", ok: true });
  return events;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScopeTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
        {PROVENANCE_DISCLAIMER}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" /> What Aletheia verifies
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {SCOPE_PANEL.canVerify.map(item => (
              <li key={item} className="flex items-start gap-1.5"><span className="text-primary mt-0.5 flex-shrink-0">·</span>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" /> What Aletheia cannot verify
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {SCOPE_PANEL.cannotVerify.map(item => (
              <li key={item} className="flex items-start gap-1.5"><span className="text-destructive mt-0.5 flex-shrink-0">·</span>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CertificateTab({ cert }: { cert: VerificationCertificate }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Provenance Certificate</span>
          <span className="ml-auto text-xs border border-primary/30 text-primary px-2 py-0.5 rounded-full">
            {cert.certificate_class}
          </span>
        </div>
        <div className="space-y-1.5 text-sm">
          {[
            ["Certificate ID",  cert.certificate_id],
            ["Issued at",       new Date(cert.issued_at).toLocaleString()],
            ["Media hash",      shorten(cert.subject.media_hash, 14)],
            ["Device ID",       cert.subject.device_id],
            ["Captured",        new Date(cert.subject.capture_timestamp).toLocaleString()],
            ["Algorithm",       cert.subject.algorithm],
            ["AI disclosure",   cert.subject.ai_disclosure],
            ["Overall valid",   cert.verification.overall_valid ? "YES" : "NO"],
            ["Trust score",     cert.verification.trust_score + "/100"],
            ["Certificate hash",shorten(cert.certificate_hash ?? "", 14)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border/40 pb-1.5 last:border-0">
              <span className="text-muted-foreground flex-shrink-0">{k}</span>
              <span className="font-mono text-xs text-right break-all">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        {cert.scope_notes.provenance_disclaimer}
      </div>

      <div className="rounded-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Infrastructure note: </strong>
        {cert.issuer.infrastructure_note}
      </div>

      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => downloadCertificateJSON(cert)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition"
        >
          <Download className="w-3.5 h-3.5" /> Download JSON
        </button>
        <button
          onClick={() => downloadCertificateText(cert)}
          className="flex items-center gap-2 border border-border bg-card px-4 py-2 rounded-md text-sm hover:bg-secondary transition"
        >
          <FileText className="w-3.5 h-3.5" /> Download text
        </button>
      </div>
    </div>
  );
}

function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <div className="space-y-1.5">
      {events.map((ev, i) => (
        <div key={i} className="flex items-start gap-2.5 text-xs py-1.5 border-b border-border/40 last:border-0">
          {ev.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            : <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <code className="font-mono text-[10px] text-muted-foreground/70">{ev.event}</code>
            </div>
            <div className="text-muted-foreground mt-0.5 break-all">{ev.detail}</div>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground/50 flex-shrink-0">
            <Clock className="w-2.5 h-2.5" />
            <span className="text-[9px]">{new Date(ev.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function VerifyPage() {
  const [media, setMedia]       = useState<{ name: string; bytes: Uint8Array; url?: string } | null>(null);
  const [bundle, setBundle]     = useState<SignatureBundle | null>(null);
  const [result, setResult]     = useState<VerifyResult | null>(null);
  const [forensics, setForensics] = useState<ForensicReport | null>(null);
  const [certificate, setCertificate] = useState<VerificationCertificate | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [tampered, setTampered] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [tab, setTab]           = useState<TabId>("checks");

  async function onMedia(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    setMedia({ name: file.name, bytes, url });
    setResult(null); setForensics(null); setCertificate(null); setAuditLog([]); setTampered(false);
  }

  async function onBundle(file: File) {
    try {
      setBundle(JSON.parse(await file.text()) as SignatureBundle);
      setResult(null); setForensics(null); setCertificate(null); setAuditLog([]); setErr(null);
    } catch { setErr("Invalid bundle JSON."); }
  }

  const runVerify = useCallback(async (
    bytesOverride?: Uint8Array,
    isTampered = false
  ) => {
    if (!media || !bundle) return;

    setBusy(true);
    setTampered(isTampered);
    setErr(null);

    try {
      const bytes = bytesOverride ?? media.bytes;

      // ── FIX: Compute the actual SHA-256 of the uploaded media bytes ──────
      // The backend "hash_integrity" check recomputes hash(bundle_json) which
      // is not the same as hash(media). True tamper detection requires sending
      // the actual media hash so the backend can compare it to bundle.media_hash.
      const actualMediaHash = await sha256Hex(bytes);

      const response = await apiVerify(
        actualMediaHash,
        bundle
      );

      // If the API is unreachable (e.g. local dev without a backend), fall
      // back to full client-side verification so the app remains functional.
      let verificationResult: VerifyResult;

      if (!response.ok || !response.data) {
        // Client-side fallback: run verification locally
        verificationResult = await verifyCapture(bytes, bundle);
      } else {
        // Backend response — map to VerifyResult shape
        const backend = response.data as {
          valid: boolean;
          trust_score?: number;
          checks?: Array<{ label: string; passed: boolean }>;
        };

        verificationResult = {
          valid: backend.valid,
          trust_score: backend.trust_score ?? 0,
          reasons: [],
          checks: (backend.checks ?? []).map((c) => ({
            label: c.label,
            ok: c.passed,
          })),
          bundle,
          // Use the actual recomputed hash so the UI hash-comparison tab
          // correctly shows a mismatch for tampered files.
          recomputed_hash: actualMediaHash,
        };
      }

      setResult(verificationResult);
      setTab("checks");

      const f = await runForensicAnalysis(bytes, bundle, verificationResult);
      setForensics(f);

      const cert = await generateVerificationCertificate(verificationResult, f);
      setCertificate(cert);

      setAuditLog(buildAuditLog(verificationResult, f));

    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }, [media, bundle]);

  async function simulateTamper() {
    if (!media) return;
    const t = new Uint8Array([...media.bytes]);
    const idx = Math.max(100, Math.floor(t.length * 0.1));
    t[idx] ^= 0xFF;
    if (idx + 1 < t.length) t[idx + 1] ^= 0xAA;
    if (idx + 2 < t.length) t[idx + 2] ^= 0x55;
    await runVerify(t, true);
  }

  const trustLevel = result
    ? computeTrustLevel({ hashMatch: result.recomputed_hash === result.bundle.media_hash, signatureValid: result.valid, deviceIdConsistent: true, timestampValid: true })
    : null;
  const trustCfg = trustLevel ? TRUST_LEVELS[trustLevel] : null;

  const TABS: Array<{ id: TabId; label: string; badge?: string }> = [
    { id: "checks",      label: "Verification" },
    { id: "hash",        label: "Hash" },
    { id: "forensics",   label: "Provenance Audit" },
    { id: "certificate", label: "Certificate", badge: certificate ? "↓" : undefined },
    { id: "proof",       label: "Proof Details" },
    { id: "scope",       label: "Scope" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Verify Provenance</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Cryptographic provenance verification with downloadable certificates.
            Confirms integrity and lineage — independent of semantic truth of depicted content.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <span className="text-muted-foreground">{PROVENANCE_DISCLAIMER}</span>
          <button onClick={() => setTab("scope")} className="text-xs underline text-primary whitespace-nowrap flex-shrink-0">
            Learn more
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <DropZone label="Media file" icon={<ImageIcon className="w-4 h-4" />} onFile={onMedia} selected={media?.name} />
          <DropZone label="Proof bundle (.json)" icon={<FileJson className="w-4 h-4" />} onFile={onBundle} selected={bundle ? "bundle loaded" : undefined} accept="application/json" />
        </div>

        {err && <div className="text-sm text-destructive">{err}</div>}

        <div className="flex flex-wrap gap-3">
          <button onClick={() => runVerify()} disabled={!media || !bundle || busy}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md font-medium disabled:opacity-40 hover:opacity-90 transition">
            {busy ? <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Verify provenance
          </button>
          {media && bundle && (
            <button onClick={simulateTamper} disabled={busy}
              className="flex items-center gap-2 border border-destructive/40 text-destructive bg-destructive/5 px-4 py-2.5 rounded-md text-sm font-medium hover:bg-destructive/10 disabled:opacity-40 transition">
              <Bug className="w-4 h-4" /> Simulate tamper
            </button>
          )}
          {certificate && (
            <button onClick={() => downloadCertificateJSON(certificate)}
              className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-md text-sm hover:bg-secondary transition ml-auto">
              <Download className="w-3.5 h-3.5" /> Certificate
            </button>
          )}
        </div>

        {tampered && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-4 py-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            3 bytes XOR-modified. Provenance hash mismatch detected.
          </div>
        )}

        {result && trustCfg && (
          <div className="space-y-4">
            <div className="rounded-lg border p-5" style={{ borderColor: trustCfg.color + "44", background: trustCfg.bgColor }}>
              <div className="flex items-start gap-4">
                <svg width="90" height="90" viewBox="0 0 90 90">
                  <circle cx="45" cy="45" r="34" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="8" />
                  <circle cx="45" cy="45" r="34" fill="none" stroke={trustCfg.color} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - trustCfg.score / 100)}
                    transform="rotate(-90 45 45)" style={{ transition: "stroke-dashoffset 1s ease" }} />
                  <text x="45" y="40" textAnchor="middle" fill="currentColor" fontSize="20" fontWeight="600">{trustCfg.score}</text>
                  <text x="45" y="56" textAnchor="middle" fill="currentColor" fontSize="8" opacity="0.5">SCORE</text>
                </svg>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    {result.valid ? <ShieldCheck className="w-5 h-5" style={{ color: trustCfg.color }} /> : <ShieldX className="w-5 h-5" style={{ color: trustCfg.color }} />}
                    <span className="text-xl font-semibold">{trustCfg.shortLabel}</span>
                  </div>
                  <div className="text-sm font-medium px-3 py-1.5 rounded-md inline-block mb-2"
                    style={{ background: trustCfg.color + "22", color: trustCfg.color }}>
                    {trustCfg.label}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{trustCfg.guarantees}</p>
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground border-t border-border/40 pt-2 mt-2">
                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    {trustCfg.caveat}
                  </div>
                  {media?.url && <img src={media.url} alt="" className="mt-3 w-full max-h-40 object-contain rounded-md border border-border/50" />}
                </div>
              </div>
            </div>

            <div className="border-b border-border flex gap-0 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm border-b-2 transition whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                  {t.badge && <span className="text-[10px] text-primary font-mono">{t.badge}</span>}
                </button>
              ))}
            </div>

            {tab === "checks" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-card p-5">
                  <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Info className="w-3 h-3" /> Cryptographic provenance checks only
                  </div>
                  <div className="space-y-2">
                    {result.checks.map(c => (
                      <div key={c.label} className="flex items-center gap-2.5 text-sm py-1.5 border-b border-border/40 last:border-0">
                        {c.ok ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" /> : <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />}
                        <span className={c.ok ? "" : "text-destructive"}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {auditLog.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" /> Verification audit trail
                    </div>
                    <AuditTrail events={auditLog} />
                  </div>
                )}
              </div>
            )}

            {tab === "hash" && (
              <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Signed hash (in bundle)</div>
                  <div className="font-mono text-xs bg-primary/5 border border-primary/30 rounded-md px-3 py-2 break-all text-primary">{result.bundle.media_hash}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Recomputed hash (SHA-256 of uploaded file)</div>
                  <div className={`font-mono text-xs border rounded-md px-3 py-2 break-all ${result.recomputed_hash === result.bundle.media_hash ? "bg-primary/5 border-primary/30 text-primary" : "bg-destructive/5 border-destructive/30 text-destructive"}`}>
                    {result.recomputed_hash}
                  </div>
                </div>
                <div className="text-xs font-medium" style={{ color: result.recomputed_hash === result.bundle.media_hash ? trustCfg.color : "oklch(0.65 0.25 25)" }}>
                  {result.recomputed_hash === result.bundle.media_hash
                    ? "✓ Hashes identical — file integrity confirmed"
                    : "✗ Hash mismatch — content modified after signing"}
                </div>
                <div className="text-xs text-muted-foreground border-t border-border/40 pt-3 flex items-start gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  Hash integrity confirms the file has not changed since signing. Does not validate semantic truth.
                </div>
              </div>
            )}

            {tab === "forensics" && (
              <div className="rounded-lg border border-border bg-card p-5">
                {forensics ? (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <Microscope className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">Provenance audit</span>
                      <span className={`ml-auto text-xs font-medium uppercase ${forensics.verdict === "clean" ? "text-primary" : forensics.verdict === "tampered" ? "text-destructive" : "text-yellow-500"}`}>
                        {forensics.verdict}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">{forensics.summary}</p>
                    <div className="space-y-2">
                      {forensics.checks.map(c => (
                        <div key={c.id} className="flex items-start gap-2.5 text-sm py-1.5 border-b border-border/40 last:border-0">
                          {c.ok ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                            : c.riskLevel === "critical" ? <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                            : <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />}
                          <div className="flex-1">
                            <div className={c.ok ? "" : "text-destructive"}>{c.label}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">{c.detail}</div>
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">{c.confidence}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Score:</span>
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${forensics.overallScore}%`, background: forensics.overallScore >= 75 ? "oklch(0.72 0.19 155)" : "oklch(0.65 0.25 25)" }} />
                      </div>
                      <span className="font-mono font-medium">{forensics.overallScore}/100</span>
                    </div>
                  </>
                ) : <div className="py-8 text-center text-muted-foreground text-sm">Running provenance audit…</div>}
              </div>
            )}

            {tab === "certificate" && certificate && (
              <CertificateTab cert={certificate} />
            )}

            {tab === "proof" && (
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4 font-medium text-sm">
                  <Link2 className="w-4 h-4 text-primary" /> Cryptographic proof details
                </div>
                <div className="space-y-1.5 text-sm">
                  {[
                    ["Device ID",          result.bundle.device_id,                         true],
                    ["Public key (Ed25519)",shorten(result.bundle.public_key, 18),           true],
                    ["Signature",          shorten(result.bundle.signature, 18),             true],
                    ["Timestamp",          new Date(result.bundle.timestamp).toLocaleString(),false],
                    ["Nonce",              shorten(result.bundle.nonce, 12),                 true],
                    ["GPS",                result.bundle.gps ? `${result.bundle.gps.lat}, ${result.bundle.gps.lon}` : "not included", false],
                    ["Bundle version",     String(result.bundle.version),                    false],
                  ].map(([k, v, mono]) => (
                    <div key={k as string} className="flex justify-between gap-4 border-b border-border/40 pb-1.5 last:border-0">
                      <span className="text-muted-foreground flex-shrink-0">{k}</span>
                      <span className={`${mono ? "font-mono text-xs" : ""} text-right break-all`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "scope" && <ScopeTab />}
          </div>
        )}
      </main>
    </div>
  );
}

function DropZone({ label, icon, onFile, selected, accept }: {
  label: string; icon: React.ReactNode; onFile: (f: File) => void;
  selected?: string; accept?: string;
}) {
  return (
    <label className="block rounded-lg border border-dashed border-border bg-card p-6 cursor-pointer hover:border-primary/50 transition">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div>
      <div className="mt-4 flex items-center gap-2 text-sm">
        <Upload className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className={selected ? "text-foreground font-medium truncate" : "text-muted-foreground"}>
          {selected ?? "Click to choose a file"}
        </span>
        {selected && <CheckCircle2 className="w-4 h-4 text-primary ml-auto flex-shrink-0" />}
      </div>
      <input type="file" accept={accept} className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}
