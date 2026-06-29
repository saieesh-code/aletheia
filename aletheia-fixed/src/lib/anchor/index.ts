/**
 * Aletheia Blockchain Anchor Layer
 * Simulates immutable public timestamp notarization.
 * Only the proof hash is anchored — never the media itself.
 * Pure async simulation — no browser-specific APIs.
 */

import { sha256Hex } from "@/lib/aletheia";

export type AnchorNetwork = "ethereum" | "polygon" | "solana" | "base";

export interface NetworkConfig {
  name: string;
  symbol: string;
  explorerBase: string;
  txPrefix: string;
  color: string;
}

export const ANCHOR_NETWORKS: Record<AnchorNetwork, NetworkConfig> = {
  ethereum: {
    name: "Ethereum",
    symbol: "ETH",
    explorerBase: "https://etherscan.io/tx/",
    txPrefix: "0x",
    color: "#627EEA",
  },
  polygon: {
    name: "Polygon",
    symbol: "MATIC",
    explorerBase: "https://polygonscan.com/tx/",
    txPrefix: "0x",
    color: "#8B5CF6",
  },
  solana: {
    name: "Solana",
    symbol: "SOL",
    explorerBase: "https://solscan.io/tx/",
    txPrefix: "",
    color: "#9945FF",
  },
  base: {
    name: "Base",
    symbol: "ETH",
    explorerBase: "https://basescan.org/tx/",
    txPrefix: "0x",
    color: "#0052FF",
  },
};

export interface BlockchainAnchor {
  network: AnchorNetwork;
  transactionHash: string;
  blockNumber: number;
  anchorTimestamp: string;
  proofHash: string;
  confirmations: number;
  explorerUrl: string;
  estimatedCostUSD: number;
}

export async function buildAnchorProofHash(
  mediaHash: string,
  deviceId: string,
  timestamp: string
): Promise<string> {
  return sha256Hex(
    new TextEncoder().encode(`aletheia:anchor:${mediaHash}:${deviceId}:${timestamp}`)
  );
}

export async function anchorProof(
  proofHash: string,
  network: AnchorNetwork,
  onProgress?: (msg: string) => void
): Promise<BlockchainAnchor> {
  const config = ANCHOR_NETWORKS[network];

  onProgress?.("Broadcasting proof hash…");
  await delay(600);

  onProgress?.(`Waiting for ${config.name} block inclusion…`);
  await delay(800);

  onProgress?.("Transaction confirmed (6 blocks)");
  await delay(200);

  const seed = await sha256Hex(new TextEncoder().encode(proofHash + network + Date.now()));
  const txHash = config.txPrefix + seed + seed.slice(0, 32);

  const baseCounts: Record<AnchorNetwork, number> = {
    ethereum: 19_500_000,
    polygon: 54_000_000,
    solana: 245_000_000,
    base: 13_000_000,
  };
  const blockNumber = baseCounts[network] + Math.floor(Math.random() * 200_000);

  const costs: Record<AnchorNetwork, number> = {
    ethereum: 0.14,
    polygon: 0.001,
    solana: 0.00025,
    base: 0.003,
  };

  return {
    network,
    transactionHash: txHash,
    blockNumber,
    anchorTimestamp: new Date().toISOString(),
    proofHash,
    confirmations: 6,
    explorerUrl: config.explorerBase + txHash,
    estimatedCostUSD: costs[network],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
