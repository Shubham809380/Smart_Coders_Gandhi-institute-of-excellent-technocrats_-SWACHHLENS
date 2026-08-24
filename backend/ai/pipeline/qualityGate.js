// Stage-0 — Image Quality Gate
// ============================
// Runs before ANY model. A blurry or pitch-dark photo would either waste a
// Gemini call on garbage input or worse, extract a confident wrong answer
// from the CNN. Cheap sharp-based metrics only; no ML here.

import sharp from "sharp";
import { pipelineConfig } from "./config.js";

// Discrete Laplacian kernel; variance of its response is the standard
// blur metric (higher = sharper). Focus threshold lives in config.
const LAPLACIAN_KERNEL = [0, 1, 0, 1, -4, 1, 0, 1, 0];

async function grayscalePixels(buffer, width) {
  const { data, info } = await sharp(buffer)
    .rotate() // honour EXIF orientation first
    .resize({ width, withoutEnlargement: false })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function laplacianVariance(pixels, width, height) {
  const responses = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v =
        LAPLACIAN_KERNEL[0] * pixels[i - width - 1] +
        LAPLACIAN_KERNEL[1] * pixels[i - width] +
        LAPLACIAN_KERNEL[2] * pixels[i - width + 1] +
        LAPLACIAN_KERNEL[3] * pixels[i - 1] +
        LAPLACIAN_KERNEL[4] * pixels[i] +
        LAPLACIAN_KERNEL[5] * pixels[i + 1] +
        LAPLACIAN_KERNEL[6] * pixels[i + width - 1] +
        LAPLACIAN_KERNEL[7] * pixels[i + width] +
        LAPLACIAN_KERNEL[8] * pixels[i + width + 1];
      responses.push(v);
    }
  }
  const n = responses.length;
  if (!n) return 0;
  let mean = 0;
  for (const v of responses) mean += v;
  mean /= n;
  let variance = 0;
  for (const v of responses) variance += (v - mean) * (v - mean);
  return variance / n;
}

/**
 * @returns {{ ok: boolean, stage:"quality", reason?: string,
 *              metrics: { laplacianVariance:number, meanLuminance:number } }}
 */
export async function checkImageQuality(imageBuffer) {
  const cfg = pipelineConfig.qualityGate;
  const fail = (reason, metrics) => ({ ok: false, stage: "quality", reason, metrics });

  try {
    const meta = await sharp(imageBuffer).metadata();
    if (!meta.width || !meta.height) return fail("Corrupt or unreadable image.", {});
    if (meta.width < cfg.minWidth || meta.height < cfg.minHeight) {
      return fail(`Image too small (${meta.width}x${meta.height}). Please retake a larger photo.`, {});
    }

    const { data, width, height } = await grayscalePixels(imageBuffer, cfg.analysisWidth);
    const metrics = {
      laplacianVariance: Math.round(laplacianVariance(data, width, height) * 10) / 10,
      meanLuminance: Math.round((data.reduce((a, b) => a + b, 0) / data.length) * 10) / 10,
    };

    if (metrics.laplacianVariance < cfg.minLaplacianVariance) {
      return fail("Photo is too blurry. Please retake a steady, focused photo of the waste.", metrics);
    }
    if (metrics.meanLuminance < cfg.minMeanLuminance) {
      return fail("Photo is too dark. Please retake in better lighting.", metrics);
    }
    return { ok: true, stage: "quality", metrics };
  } catch (err) {
    return fail(`Corrupt or unsupported image (${err.message}).`, {});
  }
}
