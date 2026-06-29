/**
 * Aletheia Lineage Engine
 * Uses tweetnacl (Ed25519) consistent with aletheia.ts signing.
 * All browser-only code guarded behind typeof window checks.
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { sha256Hex } from "@/lib/aletheia";
import type { Device } from "@/lib/aletheia";

export type LineageOperationType =
  | "capture"
  | "compress"
  | "crop"
  | "resize"
  | "enhance"
  | "metadata_edit"
  | "export"
  | "share"
  | "re_encode"
  | "ai_modify";

export interface LineageOperationMeta {
  label: string;
  description: string;
  mutatesContent: boolean;
}

export const LINEAGE_OPERATIONS: Record<LineageOperationType, LineageOperationMeta> = {
  capture:       { label: "Original Capture",    description: "First signed capture",                  mutatesContent: false },
  compress:      { label: "Compression",         description: "Lossy or lossless compression applied", mutatesContent: true  },
  crop:          { label: "Crop / Trim",          description: "Region or time segment removed",        mutatesContent: true  },
  resize:        { label: "Resize",               description: "Spatial resolution changed",            mutatesContent: true  },
  enhance:       { label: "AI Enhancement",       description: "AI-powered visual enhancement",         mutatesContent: true  },
  metadata_edit: { label: "Metadata Edit",        description: "EXIF/XMP metadata modified",           mutatesContent: false },
  export:        { label: "Export",               description: "Format conversion or export",           mutatesContent: true  },
  share:         { label: "Share / Distribute",   description: "Distributed to external party",        mutatesContent: false },
  re_encode:     { label: "Re-encode",            description: "Codec or container changed",           mutatesContent: true  },
  ai_modify:     { label: "AI Modification",      description: "AI-generated content modification",    mutatesContent: true  },
};

export interface LineageNode {
  id: string;
  parentId: string | null;
  mediaHash: string;
  previousHash: string;
  timestamp: string;
  operation: LineageOperationType;
  operationMetadata: Record<string, unknown>;
  signerDeviceId: string;
  signerPublicKey: string;
  /** Base64 Ed25519 signature over canonical payload */
  signature: string;
  nonce: string;
  trustState: string;
}

export async function createLineageNode(
  device: Device,
  mediaHash: string,
  operation: LineageOperationType,
  parentNode: LineageNode | null,
  operationMetadata: Record<string, unknown> = {}
): Promise<LineageNode> {
  const timestamp = new Date().toISOString();
  const nonce = naclUtil.encodeBase64(nacl.randomBytes(16));
  const previousHash = parentNode ? parentNode.mediaHash : "0".repeat(64);
  const parentId = parentNode ? parentNode.id : null;

  const canonical = JSON.stringify({ mediaHash, timestamp, device_id: device.device_id, nonce });
  const sig = nacl.sign.detached(
    naclUtil.decodeUTF8(canonical),
    naclUtil.decodeBase64(device.secret_key)
  );
  const signature = naclUtil.encodeBase64(sig);

  const idBytes = new TextEncoder().encode(mediaHash + previousHash + timestamp + operation + nonce);
  const id = await sha256Hex(idBytes);

  return {
    id,
    parentId,
    mediaHash,
    previousHash,
    timestamp,
    operation,
    operationMetadata,
    signerDeviceId: device.device_id,
    signerPublicKey: device.public_key,
    signature,
    nonce,
    trustState: "VERIFIED_ORIGIN",
  };
}

export interface LineageVerificationResult {
  valid: boolean;
  nodeResults: Array<{
    nodeId: string;
    operation: LineageOperationType;
    signatureValid: boolean;
    hashChainValid: boolean;
  }>;
  brokenAt: string | null;
}

export async function verifyLineageChain(
  nodes: LineageNode[]
): Promise<LineageVerificationResult> {
  const sorted = sortLineageNodes(nodes);
  const nodeResults = [];
  let brokenAt: string | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];
    const parent = sorted[i - 1] ?? null;

    let signatureValid = false;
    try {
      const canonical = JSON.stringify({
        mediaHash: node.mediaHash,
        timestamp: node.timestamp,
        device_id: node.signerDeviceId,
        nonce: node.nonce,
      });
      signatureValid = nacl.sign.detached.verify(
        naclUtil.decodeUTF8(canonical),
        naclUtil.decodeBase64(node.signature),
        naclUtil.decodeBase64(node.signerPublicKey)
      );
    } catch {
      signatureValid = false;
    }

    const expectedPrev = parent ? parent.mediaHash : "0".repeat(64);
    const hashChainValid = node.previousHash === expectedPrev;

    nodeResults.push({
      nodeId: node.id,
      operation: node.operation,
      signatureValid,
      hashChainValid,
    });

    if ((!signatureValid || !hashChainValid) && !brokenAt) {
      brokenAt = node.id;
    }
  }

  return { valid: !brokenAt, nodeResults, brokenAt };
}

export function sortLineageNodes(nodes: LineageNode[]): LineageNode[] {
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return nodes;
  const sorted: LineageNode[] = [];
  let current: LineageNode | undefined = root;
  while (current) {
    sorted.push(current);
    const next = nodes.find((n) => n.parentId === current!.id);
    current = next;
  }
  return sorted;
}

export function buildLineageSummary(nodes: LineageNode[]): string {
  return sortLineageNodes(nodes)
    .map((n) => LINEAGE_OPERATIONS[n.operation]?.label ?? n.operation)
    .join(" → ");
}
