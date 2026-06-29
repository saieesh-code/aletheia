import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { Nav } from "@/components/aletheia/Nav";
import {
  analyzeSemanticAuthenticity,
  RISK_BANDS,
  type SemanticAnalysisResult,
  type ForensicSignal,
  type RiskBand,
} from "@/lib/semantic/analysis";
import {
  AlertTriangle, Upload, Microscope, Info,
  CheckCircle2, XCircle, Minus, ShieldAlert, FileSearch,
} from "lucide-react";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Semantic Analysis — Aletheia" },
      { name: "description", content: "Probabilistic semantic forensic analysis — independent from cryptographic provenance verification." },
    ],
  }),
  component: AnalysisPage,
});

// ─── Accepted formats ─────────────────────────────────────────────────────────
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

// ─── Style maps ───────────────────────────────────────────────────────────────
type Phase = "idle" | "loaded" | "analyzing" | "done" | "error";

const VERDICT_CFG: Record<string, { color: string; bg: string; icon: React.ReactNode; headline: string }> = {
  LIKELY_SYNTHETIC:             { color: "oklch(0.65 0.25 25)",  bg: "oklch(0.65 0.25 25 / 0.10)",  icon: <XCircle className="w-5 h-5" />,      headline: "Strong synthetic generation indicators" },
  LIKELY_AI_GENERATED:          { color: "oklch(0.70 0.22 35)",  bg: "oklch(0.70 0.22 35 / 0.10)",  icon: <XCircle className="w-5 h-5" />,      headline: "Elevated AI generation likelihood" },
  LIKELY_CAMERA_CAPTURE:        { color: "oklch(0.72 0.19 155)", bg: "oklch(0.72 0.19 155 / 0.10)", icon: <CheckCircle2 className="w-5 h-5" />, headline: "Indicators consistent with camera capture" },
  MANIPULATION_RISK:            { color: "oklch(0.78 0.18 65)",  bg: "oklch(0.78 0.18 65 / 0.10)",  icon: <ShieldAlert className="w-5 h-5" />,  headline: "Multiple forensic inconsistencies detected" },
  INSUFFICIENT_EVIDENCE:        { color: "oklch(0.68 0.08 250)", bg: "oklch(0.68 0.08 250 / 0.10)", icon: <Minus className="w-5 h-5" />,        headline: "Insufficient data for reliable estimation" },
  UNKNOWN_SEMANTIC_AUTHENTICITY:{ color: "oklch(0.68 0.08 250)", bg: "oklch(0.68 0.08 250 / 0.10)", icon: <Minus className="w-5 h-5" />,        headline: "Ambiguous forensic signals — indeterminate" },
};

const RISK_COLOR: Record<string, string> = {
  high:          "oklch(0.65 0.25 25)",
  medium:        "oklch(0.78 0.18 65)",
  low:           "oklch(0.72 0.19 155)",
  indeterminate: "oklch(0.68 0.08 250)",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskGauge({ score, verdict }: { score: number; verdict: string }) {
  const cfg = VERDICT_CFG[verdict] ?? VERDICT_CFG.UNKNOWN_SEMANTIC_AUTHENTICITY;
  const r = 46, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="10" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={cfg.color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1), stroke 0.5s" }} />
        <text x="55" y="48" textAnchor="middle" fill="currentColor" fontSize="24" fontWeight="600">{score}</text>
        <text x="55" y="64" textAnchor="middle" fill="currentColor" fontSize="8" opacity="0.45" letterSpacing="1">RISK</text>
      </svg>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Synthetic risk score</span>
    </div>
  );
}

function RiskBandDisplay({ score }: { score: number }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Risk classification bands</div>
      {RISK_BANDS.map((band) => {
        const active = score >= band.min && score < band.max;
        return (
          <div key={band.label}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs transition-all ${active ? "bg-card border border-border" : "opacity-40"}`}>
            <div className="w-16 flex-shrink-0 font-mono font-medium" style={{ color: active ? getBandColor(band.min) : undefined }}>
              {band.min}–{band.max}%
            </div>
            <div className="font-medium flex-shrink-0" style={{ color: active ? getBandColor(band.min) : undefined }}>
              {band.label}
            </div>
            <div className="text-muted-foreground flex-1 hidden sm:block">{band.description.split("—")[0].trim()}</div>
            {active && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getBandColor(band.min) }} />}
          </div>
        );
      })}
    </div>
  );
}

function getBandColor(min: number): string {
  if (min >= 70) return "oklch(0.65 0.25 25)";
  if (min >= 45) return "oklch(0.70 0.22 35)";
  if (min >= 20) return "oklch(0.78 0.18 65)";
  return "oklch(0.72 0.19 155)";
}

function PrimaryIndicators({ indicators }: { indicators: string[] }) {
  if (!indicators.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
        <FileSearch className="w-3.5 h-3.5" /> Primary contributing indicators
      </div>
      <ul className="space-y-1.5">
        {indicators.map((ind, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="text-amber-500 mt-0.5 flex-shrink-0">→</span>
            <span className="text-muted-foreground">{ind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignalRow({ signal }: { signal: ForensicSignal }) {
  const [open, setOpen] = useState(false);
  const color = RISK_COLOR[signal.riskLevel] ?? RISK_COLOR.indeterminate;
  const riskLabels: Record<string, string> = { high: "High", medium: "Med", low: "Low", indeterminate: "—" };

  return (
    <div className="rounded-md border border-border/70 bg-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition text-left"
      >
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{signal.label}</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0"
              style={{ color, borderColor: color + "55" }}>
              {riskLabels[signal.riskLevel]}
            </span>
            <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
              {signal.confidence}% conf · {signal.contribution > 0 ? `+${signal.contribution}` : "0"} pts
            </span>
          </div>
          {/* Severity bar */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${signal.severity}%`, background: color }} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{signal.severity}/100</span>
          </div>
        </div>
        <span className="text-muted-foreground text-xs flex-shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/40 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{signal.explanation}</p>
          {signal.indicators.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Sub-signals</div>
              <ul className="space-y-1">
                {signal.indicators.map((ind, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span style={{ color }} className="mt-0.5 flex-shrink-0">·</span>
                    {ind}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
            <span>Category: <b>{signal.category}</b></span>
            <span>Signal confidence: <b>{signal.confidence}%</b></span>
            <span>Weighted contribution: <b>{signal.contribution} pts</b></span>
          </div>
        </div>
      )}
    </div>
  );
}

function ContributionChart({ signals }: { signals: ForensicSignal[] }) {
  const totalContrib = signals.reduce((s, x) => s + x.contribution, 0) || 1;
  const sorted = [...signals].sort((a, b) => b.contribution - a.contribution);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
        Signal contribution breakdown
      </div>
      <div className="space-y-2.5">
        {sorted.map(s => {
          const pct = Math.round((s.contribution / totalContrib) * 100);
          const color = RISK_COLOR[s.riskLevel] ?? RISK_COLOR.indeterminate;
          return (
            <div key={s.id}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground truncate pr-2">{s.label.split("(")[0].trim()}</span>
                <span className="font-mono flex-shrink-0" style={{ color }}>{pct}%</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScopePanel() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="font-medium text-sm flex items-center gap-2 mb-4">
        <Info className="w-4 h-4 text-primary" /> What this analysis assesses
      </div>
      <div className="grid md:grid-cols-2 gap-5 text-xs">
        <div>
          <div className="font-medium text-foreground mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Forensic modules assess
          </div>
          <ul className="space-y-1.5 text-muted-foreground">
            {[
              "Sensor noise floor (Laplacian analysis)",
              "Local texture variance (diffusion smoothing)",
              "JPEG/PNG file metadata & EXIF presence",
              "GAN checkerboard / upsampling artifacts",
              "Compression block boundary patterns",
              "Edge coherence & depth variation",
              "Color histogram entropy",
            ].map(item => (
              <li key={item} className="flex items-start gap-1.5">
                <span className="text-primary mt-0.5">·</span>{item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-medium text-foreground mb-2 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-destructive" /> This module cannot determine
          </div>
          <ul className="space-y-1.5 text-muted-foreground">
            {[
              "Whether depicted events objectively occurred",
              "AI generation with certainty (no neural model)",
              "Whether scenes were staged pre-capture",
              "Semantic content or subject matter",
              "Cryptographic provenance (→ use Verify)",
              "Intent behind any detected manipulation",
            ].map(item => (
              <li key={item} className="flex items-start gap-1.5">
                <span className="text-destructive mt-0.5">·</span>{item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function AnalysisPage() {
  const [phase, setPhase]       = useState<Phase>("idle");
  const [file, setFile]         = useState<{ bytes: Uint8Array; url: string; name: string; mime: string } | null>(null);
  const [result, setResult]     = useState<SemanticAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scanLine, setScanLine] = useState(0);
  const scanTimer               = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeTab, setActiveTab] = useState<"signals" | "bands" | "chart">("signals");

  const loadFile = useCallback(async (f: File) => {
    if (!ACCEPTED.includes(f.type)) {
      setErrorMsg("Unsupported format. Please upload JPEG, PNG, or WebP.");
      return;
    }
    setErrorMsg(null);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const url   = URL.createObjectURL(f);
    setFile({ bytes, url, name: f.name, mime: f.type });
    setResult(null);
    setPhase("loaded");
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!file) return;
    setPhase("analyzing");
    setScanLine(0);
    scanTimer.current = setInterval(() => setScanLine(p => (p + 1.5) % 100), 25);
    try {
      const r = await analyzeSemanticAuthenticity(file.bytes, file.mime);
      clearInterval(scanTimer.current!);
      setResult(r);
      setPhase("done");
      setActiveTab("signals");
    } catch (e) {
      clearInterval(scanTimer.current!);
      setErrorMsg(String(e));
      setPhase("error");
    }
  }, [file]);

  const verdictCfg = result ? (VERDICT_CFG[result.verdict] ?? VERDICT_CFG.UNKNOWN_SEMANTIC_AUTHENTICITY) : null;

  const TABS = [
    { id: "signals" as const, label: "Signal Breakdown" },
    { id: "bands"   as const, label: "Risk Bands" },
    { id: "chart"   as const, label: "Contribution Chart" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Semantic Forensic Analysis</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Probabilistic estimation of synthetic media characteristics using 7 independent forensic modules.
            Independent from cryptographic provenance verification.
          </p>
        </div>

        {/* Primary disclaimer */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-medium text-amber-500">Probabilistic estimation only — </span>
            <span className="text-muted-foreground">
              This analysis uses statistical image heuristics and cannot definitively determine whether any image is AI-generated or camera-captured.
              Semantic analysis estimates synthetic likelihood using forensic heuristics and cannot independently prove objective truth or falsity.
              Use the{" "}
              <a href="/verify" className="underline text-foreground hover:text-primary">Verify page</a>
              {" "}for cryptographic provenance verification.
            </span>
          </div>
        </div>

        {/* Scope panel */}
        <ScopePanel />

        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
          className={`rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden ${dragging ? "border-primary bg-primary/5" : "border-border bg-card"}`}
        >
          {phase === "idle" ? (
            <label className="flex flex-col items-center justify-center p-14 cursor-pointer">
              <Upload className="w-7 h-7 text-muted-foreground mb-3" />
              <div className="font-medium text-sm">Drop an image or click to upload</div>
              <div className="text-xs text-muted-foreground mt-1">JPEG · PNG · WebP</div>
              <div className="text-[10px] text-muted-foreground/60 mt-2 max-w-xs text-center">
                This analysis is probabilistic forensic estimation and independent from cryptographic provenance verification.
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
            </label>
          ) : (
            <div>
              {file?.url && (
                <div className="relative overflow-hidden" style={{ maxHeight: 280 }}>
                  <img src={file.url} alt="Uploaded for analysis"
                    className="w-full object-contain" style={{ maxHeight: 280 }} />
                  {/* Animated scan line */}
                  {phase === "analyzing" && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute left-0 right-0 h-px"
                        style={{
                          top: `${scanLine}%`,
                          background: "linear-gradient(90deg, transparent, oklch(0.72 0.19 155), transparent)",
                          boxShadow: "0 0 10px 2px oklch(0.72 0.19 155 / 0.6)",
                          transition: "top 0.025s linear",
                        }} />
                      <div className="absolute inset-0"
                        style={{ background: "linear-gradient(rgba(0,0,0,0.0) 0%, rgba(0,212,170,0.04) 50%, rgba(0,0,0,0.0) 100%)" }} />
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 px-4 py-3 border-t border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{file?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {file?.mime} · {file ? Math.round(file.bytes.length / 1024) : 0} KB
                  </div>
                </div>
                <button onClick={() => { setPhase("idle"); setResult(null); setFile(null); }}
                  className="text-xs text-muted-foreground border border-border px-2.5 py-1 rounded-md hover:bg-secondary transition">
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errorMsg}
          </div>
        )}

        {/* Actions */}
        {(phase === "loaded" || phase === "done") && (
          <button onClick={runAnalysis}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-md font-medium hover:opacity-90 transition">
            <Microscope className="w-4 h-4" />
            {phase === "done" ? "Re-analyze" : "Run forensic analysis"}
          </button>
        )}

        {phase === "analyzing" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
            Running 7 forensic modules — noise floor, texture, metadata, GAN fingerprint, compression, edge coherence, color space…
          </div>
        )}

        {/* ─── Results ─────────────────────────────────────────────────────── */}
        {result && phase === "done" && verdictCfg && (
          <div className="space-y-5">

            {/* Verdict banner */}
            <div className="rounded-xl border p-5"
              style={{ borderColor: verdictCfg.color + "44", background: verdictCfg.bg }}>
              <div className="flex items-start gap-5 flex-wrap">
                <RiskGauge score={result.syntheticRiskScore} verdict={result.verdict} />
                <div className="flex-1 min-w-48 pt-1">
                  <div className="flex items-center gap-2 mb-1.5" style={{ color: verdictCfg.color }}>
                    {verdictCfg.icon}
                    <span className="text-xl font-semibold">{result.verdictLabel}</span>
                  </div>
                  <div className="text-sm font-medium px-3 py-1.5 rounded-md inline-block mb-3"
                    style={{ background: verdictCfg.color + "22", color: verdictCfg.color }}>
                    {verdictCfg.headline} · Confidence: {result.overallConfidence}%
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {result.riskBand.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {result.cryptographicNote}
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground flex gap-4 flex-wrap">
                    <span>Image: {result.processingMetadata.imageWidth}×{result.processingMetadata.imageHeight}px</span>
                    <span>Size: {Math.round(result.processingMetadata.fileSizeBytes / 1024)} KB</span>
                    <span>Analysis: {result.processingMetadata.analysisMs}ms</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mandatory disclaimer above results */}
            <div className="rounded-md border border-border bg-secondary/20 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {result.disclaimer}
            </div>

            {/* Primary indicators */}
            {result.primaryIndicators.length > 0 && (
              <PrimaryIndicators indicators={result.primaryIndicators} />
            )}

            {/* Result tabs */}
            <div>
              <div className="border-b border-border flex gap-0 mb-5">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-2.5 text-sm border-b-2 transition whitespace-nowrap ${activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {activeTab === "signals" && (
                <div className="space-y-2">
                  {result.signals
                    .slice()
                    .sort((a, b) => b.severity - a.severity)
                    .map(s => <SignalRow key={s.id} signal={s} />)}
                </div>
              )}

              {activeTab === "bands" && (
                <RiskBandDisplay score={result.syntheticRiskScore} />
              )}

              {activeTab === "chart" && (
                <ContributionChart signals={result.signals} />
              )}
            </div>

            {/* Signal risk summary bar */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap gap-4 text-xs mb-3">
                {(["high", "medium", "low", "indeterminate"] as const).map(level => {
                  const count = result.signals.filter(s => s.riskLevel === level).length;
                  const labels: Record<string, string> = { high: "High risk", medium: "Medium risk", low: "Low risk", indeterminate: "Indeterminate" };
                  return (
                    <div key={level} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: RISK_COLOR[level] }} />
                      <span className="text-muted-foreground">{labels[level]}:</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
                {(["high", "medium", "low", "indeterminate"] as const).map(level => {
                  const count = result.signals.filter(s => s.riskLevel === level).length;
                  const pct = (count / result.signals.length) * 100;
                  return pct > 0 ? (
                    <div key={level}
                      style={{ width: `${pct}%`, background: RISK_COLOR[level], transition: "width 0.7s ease" }} />
                  ) : null;
                })}
              </div>
            </div>

            {/* Final disclaimer */}
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
              <div>
                <span className="font-medium text-amber-500">Important: </span>
                This analysis is probabilistic forensic estimation and independent from cryptographic provenance verification.
                Results should not be used as sole evidence in legal, journalistic, or institutional proceedings.
                Consult qualified digital forensic experts for evidentiary assessments.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
