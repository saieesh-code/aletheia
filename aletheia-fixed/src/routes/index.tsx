import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/aletheia/Nav";
import { Camera, ShieldCheck, FileCheck2, Link2, Cpu, Fingerprint } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aletheia — Reality Verification Infrastructure" },
      { name: "description", content: "Cryptographic provenance for photos & video. Sign at capture, verify anywhere." },
      { property: "og:title", content: "Aletheia — Reality Verification Infrastructure" },
      { property: "og:description", content: "Cryptographic provenance for photos & video. Sign at capture, verify anywhere." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main>
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 relative">
          <div className="absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.78_0.18_160/0.18),transparent_50%),radial-gradient(circle_at_70%_60%,oklch(0.72_0.15_240/0.18),transparent_50%)]" />
          </div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary border border-primary/30 bg-primary/10 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> MVP — Live Demo
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-semibold tracking-tighter max-w-4xl">
            Proof that what you saw <span className="text-primary">actually happened.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Aletheia is a cryptographic provenance layer for the real world. Capture signs media at the
            source with an Ed25519 key bound to the device. Anyone, anywhere can verify it — no platform,
            no trust required.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/capture" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-md font-medium hover:opacity-90 transition">
              <Camera className="w-4 h-4" /> Capture & sign
            </Link>
            <Link to="/verify" className="inline-flex items-center gap-2 border border-border bg-card px-5 py-3 rounded-md font-medium hover:bg-secondary transition">
              <ShieldCheck className="w-4 h-4" /> Verify a file
            </Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: Fingerprint, title: "Bound to device", body: "Each device generates an Ed25519 keypair. The secret never leaves the client; the public key becomes the device identity." },
              { icon: Cpu, title: "Signed at the source", body: "On capture we hash the raw bytes (SHA-256) and sign a canonical bundle: hash, timestamp, GPS, nonce, device." },
              { icon: FileCheck2, title: "Verifiable anywhere", body: "Any third party re-hashes the media and verifies the signature offline. One byte changed → verification fails." },
              { icon: Link2, title: "Hash-chained ledger", body: "Every signed capture is appended to a tamper-evident log. Each entry pins the previous hash — no blockchain needed." },
              { icon: ShieldCheck, title: "Zero trust UX", body: "Verification surfaces every check that passed or failed, plus a transparent trust score from 0 to 100." },
              { icon: Camera, title: "Capture lineage", body: "View the full provenance timeline of a media_id — when it was signed, by which device, where." },
            ].map((f) => (
              <div key={f.title} className="rounded-lg border border-border bg-card p-5 hover:border-primary/40 transition">
                <f.icon className="w-5 h-5 text-primary" />
                <div className="mt-3 font-medium">{f.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{f.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-32">
          <h2 className="text-2xl font-semibold tracking-tight">How a capture flows</h2>
          <div className="mt-6 grid md:grid-cols-4 gap-3 text-sm">
            {["Capture media", "Hash + sign on device", "Append to ledger", "Verify anywhere"].map((s, i) => (
              <div key={s} className="rounded-md border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">Step {i + 1}</div>
                <div className="mt-1 font-medium">{s}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Aletheia MVP · Ed25519 · SHA-256 · Hash-chained ledger
      </footer>
    </div>
  );
}
