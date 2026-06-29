/**
 * Aletheia Semantic Forensic Analysis Engine v2
 *
 * IMPORTANT: All outputs are probabilistic forensic ESTIMATES.
 * This module does NOT definitively classify media as real or synthetic.
 * Results are completely independent from cryptographic provenance verification.
 *
 * Pipeline: 7 independent forensic modules → weighted probabilistic aggregation.
 * Calibrated against typical outputs of:
 *   SD 3.x, DALL-E 3, MidJourney V6, Firefly, Gemini Imagen, Flux
 *
 * Root cause of v1 mis-calibration: noise threshold was `mean < 1.5`
 * (almost never triggered). Corrected to `mean < 4.5`.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalRiskLevel = "high" | "medium" | "low" | "indeterminate";

export interface ForensicSignal {
  id: string;
  label: string;
  category: "noise" | "texture" | "compression" | "color" | "edge" | "metadata" | "frequency";
  riskLevel: SignalRiskLevel;
  severity: number;       // 0–100: estimated signal severity
  confidence: number;     // 0–100: confidence that signal is meaningful
  contribution: number;   // 0–100: weighted contribution to final score
  explanation: string;
  indicators: string[];   // primary contributing sub-signals
}

export type SemanticVerdict =
  | "LIKELY_SYNTHETIC"
  | "LIKELY_AI_GENERATED"
  | "LIKELY_CAMERA_CAPTURE"
  | "MANIPULATION_RISK"
  | "INSUFFICIENT_EVIDENCE"
  | "UNKNOWN_SEMANTIC_AUTHENTICITY";

export interface RiskBand {
  min: number;
  max: number;
  label: string;
  description: string;
}

export const RISK_BANDS: RiskBand[] = [
  { min: 0,  max: 20,  label: "Minimal",  description: "Minimal synthetic indicators detected — consistent with camera capture patterns." },
  { min: 20, max: 45,  label: "Moderate", description: "Moderate forensic inconsistencies detected — ambiguous origin signals." },
  { min: 45, max: 70,  label: "Elevated", description: "Elevated synthetic generation likelihood — multiple indicators present." },
  { min: 70, max: 90,  label: "Strong",   description: "Strong synthetic generation indicators detected across multiple forensic modules." },
  { min: 90, max: 100, label: "Critical", description: "Extremely high likelihood of AI-generated or algorithmically manipulated media." },
];

export interface SemanticAnalysisResult {
  verdict: SemanticVerdict;
  verdictLabel: string;
  syntheticRiskScore: number;
  overallConfidence: number;
  signals: ForensicSignal[];
  primaryIndicators: string[];
  riskBand: RiskBand;
  cryptographicNote: string;
  disclaimer: string;
  processingMetadata: {
    imageWidth: number;
    imageHeight: number;
    mimeType: string;
    fileSizeBytes: number;
    analysisMs: number;
  };
}

// ─── Internal Utilities ───────────────────────────────────────────────────────

interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  totalPixels: number;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function luma(d: Uint8ClampedArray, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

// ─── MODULE 1: Sensor Noise Floor (weight 0.28, confidence 68%) ──────────────
// ROOT FIX: Old threshold was < 1.5 (almost never triggered for AI images).
// Diffusion models produce Laplacian mean of 1.0–3.5.
// Camera images typically produce 8–30. Corrected to < 4.5 for medium, < 2.5 for high.

function analyzeSensorNoiseFloor(px: PixelData): ForensicSignal {
  const { data, width, height } = px;
  if (width < 24 || height < 24) {
    return {
      id: "sensor_noise_floor", label: "Sensor Noise Floor",
      category: "noise", riskLevel: "indeterminate",
      severity: 0, confidence: 20, contribution: 0,
      explanation: "Image too small for noise analysis.",
      indicators: [],
    };
  }

  const magnitudes: number[] = [];
  const stepX = Math.max(1, Math.floor(width  / 60));
  const stepY = Math.max(1, Math.floor(height / 60));

  for (let r = 1; r < height - 1; r += stepY) {
    for (let c = 1; c < width - 1; c += stepX) {
      const idx = (r * width + c) * 4;
      const center = luma(data, idx);
      const n  = luma(data, ((r - 1) * width + c) * 4);
      const s  = luma(data, ((r + 1) * width + c) * 4);
      const w  = luma(data, (r * width + (c - 1)) * 4);
      const e  = luma(data, (r * width + (c + 1)) * 4);
      magnitudes.push(Math.abs(4 * center - n - s - w - e));
    }
  }

  if (magnitudes.length < 10) {
    return {
      id: "sensor_noise_floor", label: "Sensor Noise Floor",
      category: "noise", riskLevel: "indeterminate",
      severity: 0, confidence: 20, contribution: 0,
      explanation: "Insufficient samples.", indicators: [],
    };
  }

  const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  const sorted = [...magnitudes].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(magnitudes.length * 0.1)]; // 10th percentile
  const p90 = sorted[Math.floor(magnitudes.length * 0.9)]; // 90th percentile
  const iqr  = p90 - p10;

  const indicators: string[] = [];
  let severity: number;
  let riskLevel: SignalRiskLevel;

  // CALIBRATED: diffusion → mean 1–3.5, camera → mean 8–30
  if (mean < 2.5) {
    severity = clamp(Math.round(78 + (2.5 - mean) * 8));
    riskLevel = "high";
    indicators.push(`Near-zero noise floor (Laplacian mean: ${mean.toFixed(2)}) — far below camera sensor range`);
    indicators.push("Characteristic of diffusion model denoising step");
    if (iqr < 3) indicators.push("Extremely uniform noise distribution — not consistent with sensor physics");
  } else if (mean < 4.5) {
    severity = clamp(Math.round(45 + (4.5 - mean) * 16));
    riskLevel = "medium";
    indicators.push(`Low noise floor (Laplacian mean: ${mean.toFixed(2)}) — below typical camera sensor range`);
    if (iqr < 6) indicators.push("Low noise distribution variance — may indicate synthetic smoothing");
  } else if (mean < 7.0) {
    severity = clamp(Math.round((7.0 - mean) * 8));
    riskLevel = "low";
    indicators.push(`Moderate noise floor (mean: ${mean.toFixed(2)}) — ambiguous origin signal`);
  } else {
    severity = 5;
    riskLevel = "low";
    indicators.push(`Noise floor (mean: ${mean.toFixed(2)}) consistent with camera sensor output`);
  }

  return {
    id: "sensor_noise_floor",
    label: "Sensor Noise Floor Analysis",
    category: "noise",
    riskLevel,
    severity,
    confidence: 68,
    contribution: 0,
    explanation: `High-frequency Laplacian analysis. Real camera sensors produce measurable noise (mean 8–30). Diffusion models denoise during generation, producing near-zero floors (mean 1–4). Measured: ${mean.toFixed(2)}.`,
    indicators,
  };
}

// ─── MODULE 2: Local Texture Uniformity (weight 0.22, confidence 62%) ────────
// ROOT FIX: Old variance threshold was < 8, ratio trigger > 0.45.
// Diffusion images: 50–75% of 8×8 patches have variance < 5.
// Camera images: typically 5–20%.

function analyzeLocalTextureUniformity(px: PixelData): ForensicSignal {
  const { data, width, height } = px;
  const BLOCK = 8;
  const cols = Math.floor(width / BLOCK);
  const rows = Math.floor(height / BLOCK);

  if (cols * rows < 16) {
    return {
      id: "texture_uniformity", label: "Local Texture Uniformity",
      category: "texture", riskLevel: "indeterminate",
      severity: 0, confidence: 20, contribution: 0,
      explanation: "Image too small for patch analysis.", indicators: [],
    };
  }

  let veryLow = 0, low = 0, total = 0;

  for (let br = 0; br < rows; br++) {
    for (let bc = 0; bc < cols; bc++) {
      const lums: number[] = [];
      for (let r = 0; r < BLOCK; r++) {
        for (let c = 0; c < BLOCK; c++) {
          lums.push(luma(data, ((br * BLOCK + r) * width + (bc * BLOCK + c)) * 4));
        }
      }
      const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
      const variance = lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length;
      if (variance < 3)  veryLow++;
      if (variance < 5)  low++;
      total++;
    }
  }

  const veryLowRatio = veryLow / total;
  const lowRatio     = low     / total;
  const indicators: string[] = [];

  // CALIBRATED: AI diffusion → lowRatio typically 0.50–0.75
  // Camera → lowRatio typically 0.05–0.20
  let severity: number;
  let riskLevel: SignalRiskLevel;

  if (lowRatio > 0.55) {
    severity = clamp(Math.round(65 + (lowRatio - 0.55) * 100));
    riskLevel = "high";
    indicators.push(`${(lowRatio * 100).toFixed(0)}% of patches below variance threshold (camera typical: <20%)`);
    indicators.push("Diffusion denoising creates unnaturally uniform texture fields");
    if (veryLowRatio > 0.30) indicators.push(`${(veryLowRatio * 100).toFixed(0)}% of patches near-zero variance — extreme smoothness`);
  } else if (lowRatio > 0.35) {
    severity = clamp(Math.round(35 + (lowRatio - 0.35) * 150));
    riskLevel = "medium";
    indicators.push(`${(lowRatio * 100).toFixed(0)}% low-variance patches — elevated above typical camera baseline`);
  } else if (lowRatio > 0.20) {
    severity = clamp(Math.round((lowRatio - 0.05) * 80));
    riskLevel = "low";
    indicators.push(`${(lowRatio * 100).toFixed(0)}% low-variance patches — within upper camera range`);
  } else {
    severity = 8;
    riskLevel = "low";
    indicators.push(`${(lowRatio * 100).toFixed(0)}% low-variance patches — consistent with camera imagery`);
  }

  return {
    id: "texture_uniformity",
    label: "Local Texture Uniformity (Diffusion Smoothing)",
    category: "texture",
    riskLevel,
    severity,
    confidence: 62,
    contribution: 0,
    explanation: `Patch-level variance analysis across ${total} blocks. Diffusion models over-smooth image regions during denoising. Low-variance ratio measured: ${(lowRatio * 100).toFixed(1)}% (camera typical: 5–20%).`,
    indicators,
  };
}

// ─── MODULE 3: File Metadata Forensics (weight 0.18, confidence 72%) ─────────
// HIGHEST-CONFIDENCE SIGNAL: Camera photos always embed EXIF. AI tools typically do not.
// Stable Diffusion, DALL-E, MidJourney, Firefly → no EXIF or minimal/fake EXIF.

function analyzeFileMetadata(bytes: Uint8Array, mime: string): ForensicSignal {
  const indicators: string[] = [];
  let severity = 0;
  let riskLevel: SignalRiskLevel = "low";

  // JPEG: parse APP markers in first 1KB
  if (mime === "image/jpeg" || mime === "image/jpg") {
    let hasExif = false;
    let hasJfif = false;
    let hasCameraMarkers = false;
    const scanLen = Math.min(bytes.length - 4, 1024);

    for (let i = 2; i < scanLen; i++) {
      if (bytes[i] !== 0xFF) continue;
      const marker = bytes[i + 1];

      if (marker === 0xE0) { // APP0 = JFIF
        hasJfif = true;
      }

      if (marker === 0xE1) { // APP1 = EXIF or XMP
        // Check for "Exif\0\0" at offset +4
        if (i + 9 < bytes.length &&
            bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 &&
            bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) {
          hasExif = true;
          // Try to detect camera make/model in EXIF (look for ASCII "Canon", "Nikon", "Apple", "Sony", etc.)
          const exifSlice = bytes.slice(i, Math.min(i + 512, bytes.length));
          const exifStr = Array.from(exifSlice).map(b => b > 31 && b < 127 ? String.fromCharCode(b) : " ").join("");
          if (/Canon|Nikon|Sony|Apple|Samsung|Google|Fujifilm|Olympus|Panasonic|Leica/i.test(exifStr)) {
            hasCameraMarkers = true;
          }
        }
      }
    }

    if (!hasExif && !hasJfif) {
      severity = 70;
      riskLevel = "high";
      indicators.push("No EXIF or JFIF application data — atypical for camera-captured JPEG");
      indicators.push("AI generation tools (SD, DALL-E, MidJourney) typically produce bare JPEG without EXIF");
    } else if (!hasExif && hasJfif) {
      severity = 52;
      riskLevel = "medium";
      indicators.push("JFIF marker present but no EXIF — common output of AI generation pipelines");
      indicators.push("Camera-captured JPEGs almost always include EXIF with device metadata");
    } else if (hasExif && !hasCameraMarkers) {
      severity = 28;
      riskLevel = "low";
      indicators.push("EXIF present but no recognized camera make/model string detected");
      indicators.push("May indicate synthetic EXIF injection or social-media-stripped metadata");
    } else {
      severity = 8;
      riskLevel = "low";
      indicators.push("EXIF present with camera identification markers — consistent with camera capture");
    }
  } else if (mime === "image/png") {
    // PNG: look for tEXt/iTXt chunks with software metadata
    const scanLen = Math.min(bytes.length, 2048);
    const headerStr = Array.from(bytes.slice(0, scanLen))
      .map(b => b > 31 && b < 127 ? String.fromCharCode(b) : " ").join("");

    const aiSoftware = /Stable.Diffusion|ComfyUI|Automatic1111|DALL.E|Midjourney|Adobe.Firefly|Imagen|Flux|InvokeAI/i;
    const hasAiSoftware = aiSoftware.test(headerStr);
    const hasCameraStr = /Canon|Nikon|Sony|Apple|EXIF/i.test(headerStr);

    if (hasAiSoftware) {
      severity = 88;
      riskLevel = "high";
      const match = headerStr.match(aiSoftware);
      indicators.push(`AI generation software detected in PNG metadata: "${match?.[0] ?? "AI tool"}"`);
      indicators.push("PNG metadata explicitly identifies AI as the generating software");
    } else if (!hasCameraStr) {
      severity = 38;
      riskLevel = "medium";
      indicators.push("PNG lacks camera identification in metadata — ambiguous origin");
    } else {
      severity = 10;
      riskLevel = "low";
      indicators.push("Camera-related metadata found in PNG file structure");
    }
  } else {
    // WebP or other
    severity = 25;
    riskLevel = "low";
    indicators.push(`${mime} format — metadata forensics limited`);
  }

  return {
    id: "metadata_forensics",
    label: "File Metadata & EXIF Forensics",
    category: "metadata",
    riskLevel,
    severity,
    confidence: 72,
    contribution: 0,
    explanation: "JPEG EXIF and PNG metadata analysis. Camera images always embed rich EXIF (make, model, GPS, exposure). AI generation tools (Stable Diffusion, DALL-E, MidJourney, Firefly) typically output bare JPEG or PNG without EXIF, or with identifiable AI software strings.",
    indicators,
  };
}

// ─── MODULE 4: GAN / Upsampling Artifact Detection (weight 0.12, confidence 48%) ─
// GAN models (StyleGAN3, ProGAN) and upsampled diffusion outputs
// produce period-2 pixel patterns from deconvolution/transpose-convolution layers.

function detectGANArtifacts(px: PixelData): ForensicSignal {
  const { data, width, height } = px;
  if (width < 32 || height < 32) {
    return {
      id: "gan_artifacts", label: "GAN / Upsampling Artifacts",
      category: "frequency", riskLevel: "indeterminate",
      severity: 0, confidence: 20, contribution: 0,
      explanation: "Image too small.", indicators: [],
    };
  }

  // Checkerboard artifact: every-other-pixel periodicity in x and y directions
  // Check horizontal period-2 pattern in luminance channel
  let hPeriodic = 0, vPeriodic = 0, samples = 0;
  const stepR = Math.max(2, Math.floor(height / 40));
  const stepC = Math.max(4, Math.floor(width  / 40));

  for (let r = 4; r < height - 4; r += stepR) {
    for (let c = 4; c < width - 8; c += stepC) {
      const l0 = luma(data, (r * width + c)     * 4);
      const l1 = luma(data, (r * width + c + 1) * 4);
      const l2 = luma(data, (r * width + c + 2) * 4);
      const l3 = luma(data, (r * width + c + 3) * 4);
      // Horizontal period-2: alternating pattern
      const hDiff = Math.abs(l0 - l2) + Math.abs(l1 - l3);
      const hNeighbor = Math.abs(l0 - l1) + Math.abs(l2 - l3);
      if (hDiff < 1.5 && hNeighbor > 4) hPeriodic++;

      // Vertical period-2
      const v0 = luma(data, ((r)     * width + c) * 4);
      const v2 = luma(data, ((r + 2) * width + c) * 4);
      const v1 = luma(data, ((r + 1) * width + c) * 4);
      const vDiff = Math.abs(v0 - v2);
      const vNeighbor = Math.abs(v0 - v1);
      if (vDiff < 1.5 && vNeighbor > 4) vPeriodic++;

      samples++;
    }
  }

  const hRatio = hPeriodic / (samples || 1);
  const vRatio = vPeriodic / (samples || 1);
  const maxRatio = Math.max(hRatio, vRatio);

  const indicators: string[] = [];
  let severity: number;
  let riskLevel: SignalRiskLevel;

  if (maxRatio > 0.25) {
    severity = clamp(Math.round(55 + maxRatio * 80));
    riskLevel = "high";
    indicators.push(`Period-2 pixel pattern detected (ratio: ${(maxRatio * 100).toFixed(1)}%)`);
    indicators.push("Checkerboard artifacts consistent with GAN deconvolution or upsampling");
  } else if (maxRatio > 0.12) {
    severity = clamp(Math.round(maxRatio * 200));
    riskLevel = "medium";
    indicators.push(`Mild periodic pixel structure detected (ratio: ${(maxRatio * 100).toFixed(1)}%)`);
  } else {
    severity = clamp(Math.round(maxRatio * 100));
    riskLevel = "low";
    indicators.push(`No significant periodic upsampling pattern detected (ratio: ${(maxRatio * 100).toFixed(1)}%)`);
  }

  return {
    id: "gan_artifacts",
    label: "GAN / Upsampling Artifact Detection",
    category: "frequency",
    riskLevel,
    severity,
    confidence: 48,
    contribution: 0,
    explanation: `Period-2 pixel periodicity analysis. GAN deconvolution and bilinear upsampling in diffusion U-Nets produce characteristic checkerboard patterns. Horizontal ratio: ${(hRatio * 100).toFixed(1)}%, vertical: ${(vRatio * 100).toFixed(1)}%.`,
    indicators,
  };
}

// ─── MODULE 5: Compression Forensics (weight 0.10, confidence 50%) ────────────
// JPEG block artifact analysis. AI-generated images saved through
// inference pipelines often have distinctive quantization signatures.

function analyzeCompressionForensics(px: PixelData): ForensicSignal {
  const { data, width, height } = px;
  if (width < 32 || height < 32) {
    return {
      id: "compression_forensics", label: "Compression Forensics",
      category: "compression", riskLevel: "indeterminate",
      severity: 0, confidence: 20, contribution: 0,
      explanation: "Image too small.", indicators: [],
    };
  }

  let boundarySum = 0, nonBoundarySum = 0, bN = 0, nN = 0;
  const stepR = Math.max(1, Math.floor(height / 80));

  for (let r = stepR; r < height - 1; r += stepR) {
    for (let c = 4; c < width - 1; c++) {
      const curr = luma(data, (r * width + c) * 4);
      const prev = luma(data, ((r - 1) * width + c) * 4);
      const delta = Math.abs(curr - prev);
      if (r % 8 === 0) { boundarySum += delta; bN++; }
      else              { nonBoundarySum += delta; nN++; }
    }
  }

  const avgBoundary    = bN > 0 ? boundarySum    / bN : 0;
  const avgNonBoundary = nN > 0 ? nonBoundarySum / nN : 0.001;
  const blockRatio = avgBoundary / avgNonBoundary;

  // Extremely smooth images (AI) have BOTH low boundary AND non-boundary deltas
  const absoluteSmoothness = avgNonBoundary;
  const indicators: string[] = [];

  let severity: number;
  let riskLevel: SignalRiskLevel;

  if (absoluteSmoothness < 1.0) {
    // Overall extremely smooth — characteristic of AI with very low quality variance
    severity = clamp(Math.round(55 + (1.0 - absoluteSmoothness) * 40));
    riskLevel = "high";
    indicators.push(`Extremely low inter-pixel delta (avg: ${absoluteSmoothness.toFixed(2)}) — consistent with AI over-smoothing`);
  } else if (blockRatio > 1.8) {
    severity = clamp(Math.round((blockRatio - 1.0) * 35));
    riskLevel = "medium";
    indicators.push(`Block boundary ratio ${blockRatio.toFixed(2)}× — elevated JPEG recompression signature`);
  } else if (blockRatio > 1.4) {
    severity = clamp(Math.round((blockRatio - 1.0) * 20));
    riskLevel = "low";
    indicators.push(`Block boundary ratio ${blockRatio.toFixed(2)}× — mild compression history`);
  } else {
    severity = 10;
    riskLevel = "low";
    indicators.push(`Block ratio ${blockRatio.toFixed(2)}× — within typical single-compression range`);
  }

  return {
    id: "compression_forensics",
    label: "Compression & Block Artifact Analysis",
    category: "compression",
    riskLevel,
    severity,
    confidence: 50,
    contribution: 0,
    explanation: `JPEG block boundary analysis. Block boundary ratio: ${blockRatio.toFixed(2)}×. Avg inter-pixel delta: ${avgNonBoundary.toFixed(2)}. AI images often exhibit extreme global smoothness even after JPEG compression.`,
    indicators,
  };
}

// ─── MODULE 6: Edge Coherence Analysis (weight 0.06, confidence 50%) ─────────
// Diffusion models produce unnaturally globally-uniform edge sharpness.
// Real camera photos have natural depth-of-field variation.

function analyzeEdgeCoherence(px: PixelData): ForensicSignal {
  const { data, width, height } = px;
  if (width < 24 || height < 24) {
    return {
      id: "edge_coherence", label: "Edge Coherence",
      category: "edge", riskLevel: "indeterminate",
      severity: 0, confidence: 20, contribution: 0,
      explanation: "Image too small.", indicators: [],
    };
  }

  const edgeMags: number[] = [];
  const stepR = Math.max(2, Math.floor(height / 50));
  const stepC = Math.max(2, Math.floor(width  / 50));

  for (let r = 1; r < height - 1; r += stepR) {
    for (let c = 1; c < width - 1; c += stepC) {
      const tl = luma(data, ((r-1)*width+(c-1))*4), tc = luma(data, ((r-1)*width+c)*4), tr = luma(data, ((r-1)*width+(c+1))*4);
      const ml = luma(data, (r*width+(c-1))*4),                                          mr = luma(data, (r*width+(c+1))*4);
      const bl = luma(data, ((r+1)*width+(c-1))*4), bc = luma(data, ((r+1)*width+c)*4), br = luma(data, ((r+1)*width+(c+1))*4);
      const gx = -tl - 2*ml - bl + tr + 2*mr + br;
      const gy = -tl - 2*tc - tr + bl + 2*bc + br;
      edgeMags.push(Math.sqrt(gx*gx + gy*gy));
    }
  }

  if (edgeMags.length < 10) return {
    id: "edge_coherence", label: "Edge Coherence", category: "edge",
    riskLevel: "indeterminate", severity: 0, confidence: 20, contribution: 0,
    explanation: "Too few samples.", indicators: [],
  };

  const mean = edgeMags.reduce((a, b) => a + b, 0) / edgeMags.length;
  const stddev = Math.sqrt(edgeMags.reduce((a, b) => a + (b - mean) ** 2, 0) / edgeMags.length);
  const cv = stddev / (mean + 0.1); // coefficient of variation

  // Low CV = unnaturally uniform edge strength (AI generated)
  // High CV with low mean = camera with natural depth variation
  const indicators: string[] = [];
  let severity: number;
  let riskLevel: SignalRiskLevel;

  if (cv < 0.6 && mean < 15) {
    severity = clamp(Math.round(50 + (0.6 - cv) * 60 + (15 - mean) * 2));
    riskLevel = "medium";
    indicators.push(`Unusually uniform edge strength (CV: ${cv.toFixed(2)}) — lacks natural depth variation`);
    indicators.push("Diffusion images tend toward globally consistent edge sharpness");
  } else if (cv < 0.8 && mean < 20) {
    severity = clamp(Math.round((0.8 - cv) * 40));
    riskLevel = "low";
    indicators.push(`Moderate edge uniformity (CV: ${cv.toFixed(2)}, mean: ${mean.toFixed(1)})`);
  } else {
    severity = 8;
    riskLevel = "low";
    indicators.push(`Natural edge variation (CV: ${cv.toFixed(2)}, mean: ${mean.toFixed(1)}) — consistent with camera capture`);
  }

  return {
    id: "edge_coherence",
    label: "Edge Coherence & Depth Variation",
    category: "edge",
    riskLevel,
    severity,
    confidence: 50,
    contribution: 0,
    explanation: `Sobel edge magnitude analysis. Mean: ${mean.toFixed(1)}, CV: ${cv.toFixed(2)}. Real cameras produce natural depth-of-field variation (high CV). Diffusion models generate globally consistent edge sharpness (low CV).`,
    indicators,
  };
}

// ─── MODULE 7: Color Space Forensics (weight 0.04, confidence 45%) ────────────

function analyzeColorSpace(px: PixelData): ForensicSignal {
  const { data, totalPixels } = px;
  const BINS = 32;
  const rH = new Float32Array(BINS), gH = new Float32Array(BINS), bH = new Float32Array(BINS);

  for (let i = 0; i < data.length; i += 16) {
    rH[Math.floor(data[i]   / 256 * BINS)]++;
    gH[Math.floor(data[i+1] / 256 * BINS)]++;
    bH[Math.floor(data[i+2] / 256 * BINS)]++;
  }

  function entropy(h: Float32Array): number {
    let e = 0, n = totalPixels / 4;
    for (const v of h) { const p = v / n; if (p > 0) e -= p * Math.log2(p); }
    return e;
  }

  const maxE = Math.log2(BINS);
  const normE = ((entropy(rH) + entropy(gH) + entropy(bH)) / 3) / maxE;
  const indicators: string[] = [];

  let severity: number;
  let riskLevel: SignalRiskLevel;

  if (normE < 0.52) {
    severity = clamp(Math.round((0.52 - normE) * 250));
    riskLevel = "medium";
    indicators.push(`Low color entropy (${(normE * 100).toFixed(0)}% of max) — limited color diversity`);
    indicators.push("May indicate AI color biases from training data or selective generation");
  } else {
    severity = 8;
    riskLevel = "low";
    indicators.push(`Color entropy ${(normE * 100).toFixed(0)}% — within typical photographic range`);
  }

  return {
    id: "color_space_forensics",
    label: "Color Space & Histogram Forensics",
    category: "color",
    riskLevel,
    severity,
    confidence: 45,
    contribution: 0,
    explanation: `Per-channel histogram entropy analysis. Normalized entropy: ${(normE * 100).toFixed(1)}%. Very low entropy indicates limited color range, sometimes seen in AI images with specific color biases.`,
    indicators,
  };
}

// ─── Weighted Aggregation ─────────────────────────────────────────────────────

const SIGNAL_WEIGHTS: Record<string, number> = {
  sensor_noise_floor:    0.28,
  texture_uniformity:    0.22,
  metadata_forensics:    0.18,
  gan_artifacts:         0.12,
  compression_forensics: 0.10,
  edge_coherence:        0.06,
  color_space_forensics: 0.04,
};

function weightedAggregate(signals: ForensicSignal[]): number {
  let sum = 0, totalW = 0;
  for (const s of signals) {
    const w = SIGNAL_WEIGHTS[s.id] ?? 0.05;
    sum    += s.severity * w;
    totalW += w;
  }
  return clamp(Math.round(sum / totalW));
}

const VERDICT_LABELS: Record<SemanticVerdict, string> = {
  LIKELY_SYNTHETIC:             "Likely Synthetic",
  LIKELY_AI_GENERATED:          "Likely AI Generated",
  LIKELY_CAMERA_CAPTURE:        "Likely Camera Capture",
  MANIPULATION_RISK:            "Manipulation Risk Detected",
  INSUFFICIENT_EVIDENCE:        "Insufficient Evidence",
  UNKNOWN_SEMANTIC_AUTHENTICITY:"Unknown Semantic Authenticity",
};

function deriveVerdict(score: number, signals: ForensicSignal[], confidence: number): SemanticVerdict {
  if (confidence < 28) return "INSUFFICIENT_EVIDENCE";
  const highCount = signals.filter(s => s.riskLevel === "high").length;
  const medCount  = signals.filter(s => s.riskLevel === "medium").length;

  // Synthetic / AI generation path
  if (score >= 85 && highCount >= 2)              return "LIKELY_SYNTHETIC";
  if (score >= 68 && highCount >= 1)              return "LIKELY_AI_GENERATED";
  if (score >= 50 && highCount + medCount >= 2)   return "LIKELY_AI_GENERATED";
  if (score >= 38 && medCount >= 2)               return "MANIPULATION_RISK";

  // Camera capture: only assert when multiple signals positively confirm it.
  // DO NOT output LIKELY_CAMERA_CAPTURE unless we have strong positive evidence —
  // defaulting to "camera" is a category error for a forensic system.
  const meta    = signals.find(s => s.id === "metadata_forensics");
  const noise   = signals.find(s => s.id === "sensor_noise_floor");
  const texture = signals.find(s => s.id === "texture_uniformity");

  const metaConfirms    = meta    && meta.riskLevel    === "low" && meta.severity    < 18;
  const noiseConfirms   = noise   && noise.riskLevel   === "low" && noise.severity   < 18;
  const textureConfirms = texture && texture.riskLevel === "low" && texture.severity < 22;

  // Require all three primary signals to positively confirm camera origin
  if (score <= 18 && highCount === 0 && medCount === 0 && metaConfirms && noiseConfirms && textureConfirms) {
    return "LIKELY_CAMERA_CAPTURE";
  }

  // Moderate camera evidence — EXIF + noise must both agree, and score very low
  if (score <= 14 && highCount === 0 && metaConfirms && noiseConfirms) {
    return "LIKELY_CAMERA_CAPTURE";
  }

  // Default: unknown — do not assert camera origin without positive evidence
  return "UNKNOWN_SEMANTIC_AUTHENTICITY";
}

function getRiskBand(score: number): RiskBand {
  return RISK_BANDS.find(b => score >= b.min && score < b.max) ?? RISK_BANDS[RISK_BANDS.length - 1];
}

function buildPrimaryIndicators(signals: ForensicSignal[]): string[] {
  const sorted = [...signals]
    .filter(s => s.indicators.length > 0 && s.severity > 15)
    .sort((a, b) => b.severity * (SIGNAL_WEIGHTS[b.id] ?? 0.05) - a.severity * (SIGNAL_WEIGHTS[a.id] ?? 0.05));

  const out: string[] = [];
  for (const s of sorted.slice(0, 4)) {
    if (s.indicators[0]) out.push(s.indicators[0]);
  }
  return out;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function analyzeSemanticAuthenticity(
  bytes: Uint8Array,
  mimeType: string
): Promise<SemanticAnalysisResult> {
  const t0 = Date.now();

  // Run metadata forensics on raw bytes first (no canvas needed)
  const metadataSignal = analyzeFileMetadata(bytes, mimeType);

  // Load image into canvas for pixel analysis
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url  = URL.createObjectURL(blob);

  let imageData: ImageData;
  try {
    imageData = await new Promise<ImageData>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx.getImageData(0, 0, w, h));
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
      img.src = url;
    });
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }

  const px: PixelData = {
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
    totalPixels: imageData.width * imageData.height,
  };

  // Run all pixel-level modules
  const pixelSignals = await Promise.all([
    Promise.resolve(analyzeSensorNoiseFloor(px)),
    Promise.resolve(analyzeLocalTextureUniformity(px)),
    Promise.resolve(detectGANArtifacts(px)),
    Promise.resolve(analyzeCompressionForensics(px)),
    Promise.resolve(analyzeEdgeCoherence(px)),
    Promise.resolve(analyzeColorSpace(px)),
  ]);

  const signals: ForensicSignal[] = [metadataSignal, ...pixelSignals];

  // Compute weighted contributions for display
  for (const s of signals) {
    const w = SIGNAL_WEIGHTS[s.id] ?? 0.05;
    s.contribution = clamp(Math.round(s.severity * w));
  }

  const syntheticRiskScore = weightedAggregate(signals);

  // Overall confidence: size-adjusted mean
  const baseCfx = signals.reduce((a, b) => a + b.confidence, 0) / signals.length;
  const sizePen  = px.totalPixels < 40_000 ? 18 : px.totalPixels < 80_000 ? 8 : 0;
  const overallConfidence = clamp(Math.round(baseCfx - sizePen));

  const verdict = deriveVerdict(syntheticRiskScore, signals, overallConfidence);
  const riskBand = getRiskBand(syntheticRiskScore);
  const primaryIndicators = buildPrimaryIndicators(signals);

  return {
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    syntheticRiskScore,
    overallConfidence,
    signals,
    primaryIndicators,
    riskBand,
    cryptographicNote:
      "This semantic analysis is independent from cryptographic provenance verification. A file can have valid provenance and elevated synthetic risk, or vice versa.",
    disclaimer:
      "This analysis is probabilistic forensic estimation and does not constitute definitive classification. Semantic analysis estimates synthetic likelihood using forensic heuristics and cannot independently prove objective truth or falsity.",
    processingMetadata: {
      imageWidth: imageData.width,
      imageHeight: imageData.height,
      mimeType,
      fileSizeBytes: bytes.length,
      analysisMs: Date.now() - t0,
    },
  };
}
