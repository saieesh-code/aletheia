/**
 * Aletheia Ledger Utilities
 * Adds Merkle root computation and stats on top of the
 * existing getLedger/appendLedger functions in aletheia.ts.
 * SSR-safe: all storage access behind typeof window guard. Uses sessionStorage in demo.
 */

import { getLedger, sha256Hex, type LedgerEntry } from "@/lib/aletheia";

export type { LedgerEntry };

export interface LedgerStats {
  totalEntries: number;
  uniqueDevices: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

export interface LedgerChainResult {
  ok: boolean;
  brokenAt: number | null;
  merkleRoot: string;
  totalEntries: number;
}

/** Build Merkle root from an array of hex hashes (synchronous approximation). */
export function buildMerkleRootSync(hashes: string[]): string {
  if (hashes.length === 0) return "0".repeat(64);
  if (hashes.length === 1) return hashes[0];

  // Simple deterministic combination — not a production Merkle tree
  // but sufficient for demo/display purposes without async overhead.
  let combined = hashes.join("");
  let h = 5381;
  for (let i = 0; i < combined.length; i++) {
    h = ((h << 5) + h) ^ combined.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, "0").repeat(8);
}

/** Verify the full chain and return stats (async for hash re-computation). */
export async function verifyLedgerChainFull(
  entries: LedgerEntry[]
): Promise<LedgerChainResult> {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const prev = i === 0 ? "0".repeat(64) : entries[i - 1].current_hash;
    if (e.previous_hash !== prev) {
      return { ok: false, brokenAt: i, merkleRoot: "0".repeat(64), totalEntries: entries.length };
    }
    const expected = await sha256Hex(
      new TextEncoder().encode(prev + JSON.stringify(e.payload))
    );
    if (expected !== e.current_hash) {
      return { ok: false, brokenAt: i, merkleRoot: "0".repeat(64), totalEntries: entries.length };
    }
  }
  const merkleRoot = buildMerkleRootSync(entries.map((e) => e.current_hash));
  return { ok: true, brokenAt: null, merkleRoot, totalEntries: entries.length };
}

export function getLedgerStats(entries: LedgerEntry[]): LedgerStats {
  const devices = new Set(entries.map((e) => e.payload.device_id));
  return {
    totalEntries: entries.length,
    uniqueDevices: devices.size,
    oldestEntry: entries[0]?.recorded_at ?? null,
    newestEntry: entries[entries.length - 1]?.recorded_at ?? null,
  };
}

export { getLedger };
