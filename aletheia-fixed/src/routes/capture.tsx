import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Nav } from "@/components/aletheia/Nav";
import {
  appendLedger,
  downloadBlob,
  getOrCreateDevice,
  shorten,
  signCapture,
  type Device,
  type SignatureBundle,
} from "@/lib/aletheia";
import { createLineageNode, type LineageNode } from "@/lib/lineage/engine";
import {
  anchorProof,
  buildAnchorProofHash,
  ANCHOR_NETWORKS,
  type BlockchainAnchor,
  type AnchorNetwork,
} from "@/lib/anchor";
import {
  Camera, MapPin, Loader2, Download, CheckCircle2,
  Upload, GitBranch, Anchor, ChevronDown, ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/capture")({
  head: () => ({
    meta: [
      { title: "Capture & Sign — Aletheia" },
      { name: "description", content: "Capture media and produce a cryptographic provenance bundle." },
    ],
  }),
  component: CapturePage,
});

interface CaptureResult {
  bundle: SignatureBundle;
  mediaUrl: string;
  mediaBytes: Uint8Array;
  mediaName: string;
  lineageRoot: LineageNode;
}

function CapturePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [useGps, setUseGps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [anchorBusy, setAnchorBusy] = useState(false);
  const [anchorProgress, setAnchorProgress] = useState<string | null>(null);
  const [selectedNet, setSelectedNet] = useState<AnchorNetwork>("polygon");
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [anchor, setAnchor] = useState<BlockchainAnchor | null>(null);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [aiDisclosure, setAiDisclosure] = useState<
    "declared_camera_original" | "declared_ai_generated" | "declared_ai_modified" | "undeclared_origin"
  >("declared_camera_original");

  useEffect(() => {
    setDevice(getOrCreateDevice());
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch {
      alert("Camera unavailable. Use the upload section below.");
    }
  }

  async function getGps(): Promise<{ lat: number; lon: number } | null> {
    if (!useGps || typeof navigator === "undefined" || !navigator.geolocation) return null;
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6) }),
        () => resolve(null),
        { timeout: 4000 }
      )
    );
  }

  const processFile = useCallback(
    async (bytes: Uint8Array, name: string, mime: string) => {
      if (!device) return;
      setBusy(true);
      try {
        const gps = await getGps();
        const bundle = await signCapture(bytes, { gps });
        const lineageRoot = await createLineageNode(
          device, bundle.media_hash, "capture", null,
          { fileName: name, mimeType: mime, aiDisclosure }
        );
        await appendLedger(bundle, name);
        const mediaUrl = mime.startsWith("image/")
          ? URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })) : "";
        setResult({ bundle, mediaUrl, mediaBytes: bytes, mediaName: name, lineageRoot });
        setAnchor(null);
      } finally {
        setBusy(false);
      }
    },
    [device, useGps, aiDisclosure]
  );

  async function captureFrame() {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.92));
    await processFile(new Uint8Array(await blob.arrayBuffer()), `capture-${Date.now()}.jpg`, "image/jpeg");
  }

  async function doAnchor() {
    if (!result || anchorBusy) return;
    setAnchorBusy(true); setAnchorProgress(null);
    try {
      const proofHash = await buildAnchorProofHash(result.bundle.media_hash, result.bundle.device_id, result.bundle.timestamp);
      setAnchor(await anchorProof(proofHash, selectedNet, setAnchorProgress));
    } finally { setAnchorBusy(false); setAnchorProgress(null); }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Capture &amp; Sign</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Ed25519 signature + SHA-256 hash bound to this device. Provenance lineage initialized. Verification confirms integrity — not semantic truth of depicted content.
          </p>
        </div>

        {device && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="font-medium mb-2">Device identity
              <span className="ml-2 text-xs bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full">Ed25519</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-1.5 text-xs">
              <Row k="Device ID" v={device.device_id} mono />
              <Row k="Public key" v={shorten(device.public_key, 18)} mono />
              <Row k="Created" v={new Date(device.created_at).toLocaleString()} />
              <Row k="Key storage" v="Browser session key (software fallback — production uses hardware SDK)" />
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-sm mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2"><Camera className="w-4 h-4" /> Live camera</span>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer font-normal">
                <input type="checkbox" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} className="accent-primary" />
                <MapPin className="w-3 h-3" /> GPS
              </label>
            </div>
            <div className="aspect-video bg-black/30 rounded-md overflow-hidden border border-border flex items-center justify-center relative mb-3">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {!streaming && <div className="absolute text-xs text-muted-foreground">Camera idle</div>}
            </div>
            {!streaming
              ? <button onClick={startCamera} className="flex items-center gap-2 border border-border bg-card px-3 py-2 rounded-md text-sm hover:bg-secondary transition"><Camera className="w-4 h-4" /> Start camera</button>
              : <button onClick={captureFrame} disabled={busy} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Capture &amp; sign
                </button>
            }
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-sm mb-3 flex items-center gap-2"><Upload className="w-4 h-4" /> Sign a file</div>
            <div className="mb-3">
              <label className="text-xs text-muted-foreground block mb-1">AI disclosure</label>
              <select value={aiDisclosure} onChange={(e) => setAiDisclosure(e.target.value as typeof aiDisclosure)}
                className="w-full text-xs bg-card border border-border rounded-md px-2 py-1.5 text-foreground">
                <option value="declared_camera_original">Declared: Camera original</option>
                <option value="declared_ai_generated">Declared: AI generated</option>
                <option value="declared_ai_modified">Declared: AI modified</option>
                <option value="undeclared_origin">Origin undeclared</option>
              </select>
            </div>
            <label className="flex flex-col items-center justify-center border border-dashed border-border rounded-md p-8 cursor-pointer hover:border-primary/50 transition">
              {busy ? <div className="flex flex-col items-center gap-2"><Loader2 className="w-6 h-6 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Signing…</span></div>
                : <><Upload className="w-5 h-5 text-muted-foreground" /><div className="mt-2 text-sm">Drop or pick a file</div><div className="text-xs text-muted-foreground">Image, video, PDF…</div></>}
              <input type="file" className="hidden" disabled={busy || !device}
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; await processFile(new Uint8Array(await f.arrayBuffer()), f.name, f.type || "application/octet-stream"); e.target.value = ""; }} />
            </label>
          </div>
        </div>

        {result && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-center gap-2 text-primary font-medium mb-4">
                <CheckCircle2 className="w-4 h-4" /> Signed &amp; appended to ledger
                <span className="ml-auto text-xs border border-primary/30 px-2 py-0.5 rounded-full">Bundle v{result.bundle.version}</span>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  {result.mediaUrl && <img src={result.mediaUrl} alt="signed" className="w-full rounded-md border border-border mb-3 max-h-52 object-contain" />}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button onClick={() => downloadBlob(result.mediaName, new Blob([new Uint8Array(result.mediaBytes)]))} className="flex items-center gap-1.5 border border-border bg-card px-3 py-1.5 rounded-md text-xs hover:bg-secondary transition"><Download className="w-3.5 h-3.5" /> Media</button>
                    <button onClick={() => downloadBlob(result.mediaName + ".aletheia.json", new Blob([JSON.stringify(result.bundle, null, 2)], { type: "application/json" }))} className="flex items-center gap-1.5 border border-border bg-card px-3 py-1.5 rounded-md text-xs hover:bg-secondary transition"><Download className="w-3.5 h-3.5" /> Bundle</button>
                  </div>
                  <div className="flex items-center gap-2 text-xs border border-border/50 rounded-md p-2.5 bg-card/50">
                    <GitBranch className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <div><div className="font-medium text-foreground">Lineage root initialized</div><div className="font-mono text-muted-foreground mt-0.5">{shorten(result.lineageRoot.id, 14)}</div></div>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  <Row k="Media hash" v={shorten(result.bundle.media_hash, 14)} mono />
                  <Row k="Signature" v={shorten(result.bundle.signature, 14)} mono />
                  <Row k="Timestamp" v={new Date(result.bundle.timestamp).toLocaleString()} />
                  <Row k="Device ID" v={result.bundle.device_id} mono />
                  <Row k="AI disclosure" v={aiDisclosure} />
                  <Row k="GPS" v={result.bundle.gps ? `${result.bundle.gps.lat}, ${result.bundle.gps.lon}` : "not included"} />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="font-medium text-sm mb-3 flex items-center gap-2">
                <Anchor className="w-4 h-4 text-muted-foreground" /> Blockchain anchor
                <span className="text-xs text-muted-foreground font-normal">— only proof hash anchored, never media</span>
              </div>
              {!anchor ? (
                <div className="flex items-center gap-3 flex-wrap">
                  {(Object.keys(ANCHOR_NETWORKS) as AnchorNetwork[]).map((net) => (
                    <button key={net} onClick={() => setSelectedNet(net)}
                      className={`px-3 py-1.5 rounded-md text-xs border transition ${selectedNet === net ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                      {ANCHOR_NETWORKS[net].name}
                    </button>
                  ))}
                  <button onClick={doAnchor} disabled={anchorBusy}
                    className="ml-auto flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-xs font-medium hover:opacity-90 disabled:opacity-50">
                    {anchorBusy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{anchorProgress ?? "Anchoring…"}</> : <><Anchor className="w-3.5 h-3.5" />Anchor on {ANCHOR_NETWORKS[selectedNet].name}</>}
                  </button>
                </div>
              ) : (
                <div className="bg-primary/5 border border-primary/20 rounded-md p-3 space-y-1.5 text-sm">
                  <Row k="Network" v={ANCHOR_NETWORKS[anchor.network].name} />
                  <Row k="Tx hash" v={shorten(anchor.transactionHash, 14)} mono />
                  <Row k="Block" v={anchor.blockNumber.toLocaleString()} />
                  <Row k="Confirmations" v={String(anchor.confirmations)} />
                  <Row k="Est. cost" v={`~$${anchor.estimatedCostUSD.toFixed(4)}`} />
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-secondary transition" onClick={() => setBundleOpen((v) => !v)}>
                <span className="text-muted-foreground">Raw proof bundle JSON</span>
                {bundleOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {bundleOpen && <pre className="text-[11px] font-mono bg-secondary/40 border-t border-border p-4 overflow-auto max-h-64 text-muted-foreground leading-relaxed">{JSON.stringify(result.bundle, null, 2)}</pre>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 pb-1.5 text-sm last:border-0">
      <span className="text-muted-foreground flex-shrink-0">{k}</span>
      <span className={`${mono ? "font-mono text-xs" : ""} text-right break-all`}>{v}</span>
    </div>
  );
}
