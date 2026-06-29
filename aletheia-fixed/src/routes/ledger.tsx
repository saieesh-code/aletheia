import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/aletheia/Nav";
import { getLedger, shorten, type LedgerEntry } from "@/lib/aletheia";
import { verifyLedgerChainFull, getLedgerStats, buildMerkleRootSync } from "@/lib/ledger/utils";
import { Link2, CheckCircle2, XCircle, RefreshCw, Database, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

export const Route = createFileRoute("/ledger")({
  head: () => ({
    meta: [
      { title: "Ledger — Aletheia" },
      { name: "description", content: "Append-only, hash-chained log of every signed capture." },
    ],
  }),
  component: LedgerPage,
});

// The ledger is stored in sessionStorage under this key (matches aletheia.ts)
const LEDGER_SESSION_KEY = "aletheia.ledger.session";

function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [chain, setChain] = useState<{ ok: boolean; brokenAt: number | null; merkleRoot: string; totalEntries: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    const e = getLedger();
    setEntries(e);
    setChain(await verifyLedgerChainFull(e));
    setLoading(false);
  }

  function clearLedger() {
    if (!confirm("Clear all ledger entries? This cannot be undone.")) return;
    if (typeof window !== "undefined") {
      // FIX: Use sessionStorage (not localStorage) with the correct key
      sessionStorage.removeItem(LEDGER_SESSION_KEY);
    }
    refresh();
  }

  useEffect(() => { refresh(); }, []);

  const stats = getLedgerStats(entries);
  const merkle = entries.length ? buildMerkleRootSync(entries.map((e) => e.current_hash)) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Provenance ledger</h1>
            <p className="mt-2 text-muted-foreground">Append-only, hash-chained — each entry pins the previous hash.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} disabled={loading}
              className="inline-flex items-center gap-2 border border-border bg-card px-3 py-1.5 rounded-md text-sm hover:bg-secondary disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Re-verify
            </button>
            {entries.length > 0 && (
              <button onClick={clearLedger}
                className="inline-flex items-center gap-2 border border-border bg-card px-3 py-1.5 rounded-md text-sm hover:bg-secondary text-destructive">
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Entries", value: stats.totalEntries },
            { label: "Status", value: chain ? (chain.ok ? "Intact" : "Broken") : "—", color: chain ? (chain.ok ? "text-primary" : "text-destructive") : "text-muted-foreground" },
            { label: "Devices", value: stats.uniqueDevices },
            { label: "Merkle root", value: merkle ? merkle.slice(0, 8) + "…" : "—" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-xl font-semibold mt-1 tabular-nums ${("color" in s ? s.color : "") || ""}`}>{String(s.value)}</div>
            </div>
          ))}
        </div>

        {chain && (
          <div className={`rounded-lg border p-4 flex items-center gap-3 text-sm ${chain.ok ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
            {chain.ok ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" /> : <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />}
            <div className="flex-1">
              {chain.ok ? `Chain intact · ${chain.totalEntries} entries verified` : `Chain broken at entry #${chain.brokenAt}`}
            </div>
            {merkle && (
              <div className="text-right text-xs">
                <div className="text-muted-foreground">Merkle root</div>
                <div className="font-mono text-primary">{merkle.slice(0, 16)}…</div>
              </div>
            )}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-12 text-center">
            <Database className="w-8 h-8 mx-auto mb-3 opacity-30" />
            No entries yet. Sign a file on the Capture page.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.slice().reverse().map((entry) => (
              <div key={entry.index} className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-3">
                  <span className="text-xs text-muted-foreground w-6 flex-shrink-0">#{entry.index}</span>
                  <Link2 className={`w-4 h-4 flex-shrink-0 ${chain?.ok ? "text-primary" : "text-destructive"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{entry.payload.media_id}</div>
                    <div className="text-xs text-muted-foreground">{entry.payload.device_id} · {new Date(entry.recorded_at).toLocaleString()}</div>
                  </div>
                  <div className="text-xs font-mono text-primary hidden md:block">{shorten(entry.current_hash, 8)}</div>
                  <button onClick={() => setExpandedIdx(expandedIdx === entry.index ? null : entry.index)}
                    className="flex-shrink-0 p-1 hover:bg-secondary rounded">
                    {expandedIdx === entry.index ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
                {expandedIdx === entry.index && (
                  <div className="border-t border-border px-4 py-4 grid md:grid-cols-2 gap-3 text-xs bg-secondary/20">
                    <HashField label="Media hash (SHA-256)" value={entry.payload.media_hash} />
                    <HashField label="Current block hash" value={entry.current_hash} />
                    <HashField label="Previous block hash" value={entry.previous_hash} />
                    <div><div className="text-muted-foreground mb-1">Recorded at</div><div>{new Date(entry.recorded_at).toLocaleString()}</div></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function HashField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1">{label}</div>
      <div className="font-mono bg-card border border-border rounded px-2 py-1.5 break-all text-primary">{value}</div>
    </div>
  );
}
