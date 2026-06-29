import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Nav } from "@/components/aletheia/Nav";
import { getOrCreateDevice, shorten, sha256Hex } from "@/lib/aletheia";
import {
  createLineageNode,
  verifyLineageChain,
  sortLineageNodes,
  buildLineageSummary,
  LINEAGE_OPERATIONS,
  type LineageNode,
} from "@/lib/lineage/engine";
import { GitBranch, Shield, ArrowDown, ChevronRight, ChevronDown, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/lineage")({
  head: () => ({
    meta: [
      { title: "Lineage — Aletheia" },
      { name: "description", content: "Immutable media provenance tree. Every operation creates a signed node." },
    ],
  }),
  component: LineagePage,
});

const OP_COLORS: Record<string, string> = {
  capture:       "oklch(0.72 0.19 155)",
  compress:      "oklch(0.65 0.18 240)",
  crop:          "oklch(0.70 0.15 215)",
  resize:        "oklch(0.70 0.15 185)",
  enhance:       "oklch(0.72 0.20 310)",
  metadata_edit: "oklch(0.78 0.18 65)",
  export:        "oklch(0.68 0.12 240)",
  share:         "oklch(0.65 0.10 250)",
  re_encode:     "oklch(0.70 0.15 215)",
  ai_modify:     "oklch(0.72 0.20 310)",
};

async function generateDemoLineage(): Promise<LineageNode[]> {
  const device = getOrCreateDevice();
  const rootHashBytes = new TextEncoder().encode("demo-capture-" + Date.now());
  const rootHash = await sha256Hex(rootHashBytes);
  const ops: Array<import("@/lib/lineage/engine").LineageOperationType> = [
    "capture", "compress", "resize", "enhance", "share",
  ];
  const nodes: LineageNode[] = [];
  let prevHash = rootHash;
  let prevNode: LineageNode | null = null;
  for (const op of ops) {
    const mediaHash = prevNode
      ? await sha256Hex(new TextEncoder().encode(prevHash + op))
      : rootHash;
    const node = await createLineageNode(device, mediaHash, op, prevNode, {});
    nodes.push(node);
    prevHash = mediaHash;
    prevNode = node;
  }
  return nodes;
}

function LineagePage() {
  const [nodes, setNodes] = useState<LineageNode[]>([]);
  const [verifyMap, setVerifyMap] = useState<Map<string, { signatureValid: boolean; hashChainValid: boolean }>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  async function loadDemo() {
    setLoading(true);
    const demo = await generateDemoLineage();
    setNodes(demo);
    setVerifyMap(new Map());
    setVerified(false);
    setSelectedId(demo[0]?.id ?? null);
    setLoading(false);
  }

  async function verifyChain() {
    if (!nodes.length) return;
    setLoading(true);
    const result = await verifyLineageChain(nodes);
    const m = new Map<string, { signatureValid: boolean; hashChainValid: boolean }>();
    result.nodeResults.forEach((r) => m.set(r.nodeId, r));
    setVerifyMap(m);
    setVerified(true);
    setLoading(false);
  }

  const sorted = sortLineageNodes(nodes);
  const summary = nodes.length ? buildLineageSummary(nodes) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="max-w-4xl mx-auto px-6 py-12 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Provenance lineage</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Every media operation creates a signed, hash-chained node — an immutable audit trail
            from original capture to current form. Think Git commits for media.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={loadDemo} disabled={loading}
            className="flex items-center gap-2 border border-border bg-card px-4 py-2 rounded-md text-sm hover:bg-secondary disabled:opacity-50 transition">
            <GitBranch className="w-4 h-4" /> {nodes.length ? "Regenerate demo" : "Load demo lineage"}
          </button>
          {nodes.length > 0 && (
            <button onClick={verifyChain} disabled={loading}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition">
              {loading ? <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : <Shield className="w-4 h-4" />}
              {verified ? "Re-verify chain" : "Verify chain"}
            </button>
          )}
        </div>

        {summary && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Lineage path</div>
            <div className="font-medium text-sm">{summary}</div>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>Nodes: <b className="text-foreground">{nodes.length}</b></span>
              <span>Verified: <b className="text-foreground">{verified ? "Yes" : "No"}</b></span>
            </div>
          </div>
        )}

        {nodes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <GitBranch className="w-10 h-10 mx-auto mb-4 opacity-30" />
            <div className="text-sm">No lineage loaded.</div>
            <div className="text-xs mt-1">Click "Load demo lineage" to see a sample provenance chain.</div>
          </div>
        ) : (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <ArrowDown className="w-3 h-3" /> Provenance chain (oldest → newest)
            </div>
            {sorted.map((node, i) => {
              const op = LINEAGE_OPERATIONS[node.operation];
              const color = OP_COLORS[node.operation] ?? OP_COLORS.capture;
              const vr = verifyMap.get(node.id);
              const isSelected = selectedId === node.id;
              const isLast = i === sorted.length - 1;
              return (
                <div key={node.id} className="flex gap-0">
                  <div className="flex flex-col items-center w-10 flex-shrink-0">
                    <div className="w-3 h-3 rounded-full border-2 flex-shrink-0 mt-5 z-10" style={{ background: color, borderColor: color }} />
                    {!isLast && <div className="w-px flex-1 bg-border/60 mt-1" style={{ minHeight: 20 }} />}
                  </div>
                  <div className="flex-1 mb-3">
                    <button
                      className={`w-full text-left rounded-lg border transition-all ${isSelected ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card hover:border-border"}`}
                      onClick={() => setSelectedId(isSelected ? null : node.id)}
                    >
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">#{i}</span>
                          <span className="text-sm font-medium" style={{ color }}>{op?.label ?? node.operation}</span>
                          {i === 0 && <span className="text-[10px] border border-primary/30 text-primary px-1.5 rounded-full">origin</span>}
                          {isLast && i > 0 && <span className="text-[10px] border border-border text-muted-foreground px-1.5 rounded-full">current</span>}
                          <div className="ml-auto flex items-center gap-1.5">
                            {vr && (vr.signatureValid && vr.hashChainValid ? <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />)}
                            {isSelected ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{new Date(node.timestamp).toLocaleString()}</span>
                          <span className="font-mono">{shorten(node.mediaHash, 8)}</span>
                        </div>
                      </div>
                    </button>
                    {isSelected && (
                      <div className="mt-1 ml-1 rounded-lg border border-border/60 bg-card p-4 text-xs space-y-2">
                        <Field label="Node ID" value={shorten(node.id, 14)} mono />
                        <Field label="Parent ID" value={node.parentId ? shorten(node.parentId, 14) : "— (root)"} mono />
                        <Field label="Media hash" value={shorten(node.mediaHash, 14)} mono />
                        <Field label="Previous hash" value={shorten(node.previousHash, 14)} mono />
                        <Field label="Signer device" value={node.signerDeviceId} mono />
                        <Field label="Mutates content" value={op?.mutatesContent ? "Yes — new hash expected" : "No"} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {nodes.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium mb-3">Operation types</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LINEAGE_OPERATIONS).map(([key, op]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: OP_COLORS[key] ?? "#888" }} />
                  <span className="text-muted-foreground">{op.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 pb-1.5 last:border-0">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className={`${mono ? "font-mono" : ""} text-right break-all text-foreground`}>{value}</span>
    </div>
  );
}
