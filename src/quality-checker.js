/**
 * Input quality verification module.
 * Runs client-side checks on uploaded images before transmission:
 * - Format and size
 * - Minimum resolution
 * - Blur via variance of Laplacian on 256x256 grayscale canvas
 * - Exposure via mean luminance and share of clipped pixels
 */

const { QUALITY_CONSTANTS } = typeof require !== "undefined"
  ? require("./quality-constants.js")
  : window.PCBGuardConstants || { QUALITY_CONSTANTS: {} };

/**
 * Compute variance of Laplacian on grayscale pixel array of size W x H.
 */
function computeLaplacianVariance(grayscale, width, height) {
  // 3x3 discrete Laplacian kernel:
  // [ 0,  1,  0 ]
  // [ 1, -4,  1 ]
  // [ 0,  1,  0 ]
  const n = (width - 2) * (height - 2);
  if (n <= 0) return 0;

  let sum = 0;
  let sumSq = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRow = (y - 1) * width;
    const nextRow = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const val =
        grayscale[prevRow + x] +
        grayscale[nextRow + x] +
        grayscale[rowOffset + x - 1] +
        grayscale[rowOffset + x + 1] -
        4 * grayscale[rowOffset + x];

      sum += val;
      sumSq += val * val;
    }
  }

  const mean = sum / n;
  const variance = (sumSq / n) - (mean * mean);
  return Math.max(0, variance);
}

/**
 * Analyze exposure and luminance on grayscale pixel array.
 */
function computeExposureStats(grayscale) {
  const total = grayscale.length;
  if (total === 0) return { meanLuminance: 0, clippedShare: 0 };

  let sum = 0;
  let clipped = 0;

  for (let i = 0; i < total; i++) {
    const v = grayscale[i];
    sum += v;
    if (v < 5 || v > 250) {
      clipped++;
    }
  }

  return {
    meanLuminance: sum / total,
    clippedShare: clipped / total
  };
}

/**
 * Validate input image and return plain-language assessment.
 * Accepts either:
 * - A canvas / ImageData / { width, height, data } object
 * - File metadata { size, name, type, width, height }
 */
function checkImageQuality(meta, pixelData) {
  const C = QUALITY_CONSTANTS;
  const issues = [];
  const metrics = {};

  // 1. File size
  if (meta.size && meta.size > C.MAX_FILE_BYTES) {
    issues.push({
      code: "OVERSIZED",
      message: `File size (${(meta.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 4.5 MB serverless upload limit.`,
      canFit: true
    });
  }

  // 2. Format
  if (meta.name && !C.ALLOWED_EXTENSIONS.test(meta.name)) {
    issues.push({
      code: "INVALID_FORMAT",
      message: "Unsupported file format. Please upload a standard JPEG, PNG, or WebP circuit board photograph.",
      canFit: false
    });
  }

  // 3. Resolution
  if (meta.width && meta.height) {
    metrics.resolution = `${meta.width}x${meta.height}`;
    if (meta.width < C.MIN_WIDTH || meta.height < C.MIN_HEIGHT) {
      issues.push({
        code: "LOW_RESOLUTION",
        message: `Image resolution (${meta.width}\u00d7${meta.height} px) is below minimum recommended ${C.MIN_WIDTH}\u00d7${C.MIN_HEIGHT} px for defect inspection.`,
        canFit: false
      });
    }
  }

  // 4. Optical Blur & Exposure (if pixelData is provided as RGBA Uint8ClampedArray)
  if (pixelData && pixelData.data && pixelData.width && pixelData.height) {
    const W = pixelData.width;
    const H = pixelData.height;
    const raw = pixelData.data;

    // Convert to grayscale: Y = 0.299*R + 0.587*G + 0.114*B
    const gray = new Float32Array(W * H);
    for (let i = 0, j = 0; i < raw.length; i += 4, j++) {
      gray[j] = 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2];
    }

    const blurVar = computeLaplacianVariance(gray, W, H);
    metrics.blurVariance = Number(blurVar.toFixed(1));
    if (blurVar < C.BLUR_THRESHOLD) {
      issues.push({
        code: "BLURRED",
        message: `Image appears out of focus or motion-blurred (focus score: ${metrics.blurVariance}, threshold: ${C.BLUR_THRESHOLD}). Fine defect traces may not be resolvable.`,
        canFit: false
      });
    }

    const { meanLuminance, clippedShare } = computeExposureStats(gray);
    metrics.meanLuminance = Number(meanLuminance.toFixed(1));
    metrics.clippedShare = Number((clippedShare * 100).toFixed(1));

    if (meanLuminance < C.MIN_MEAN_LUMINANCE) {
      issues.push({
        code: "UNDEREXPOSED",
        message: `Image is underexposed and too dark (mean luminance: ${metrics.meanLuminance}/255). Solder connections in shadow cannot be verified.`,
        canFit: false
      });
    } else if (meanLuminance > C.MAX_MEAN_LUMINANCE) {
      issues.push({
        code: "OVEREXPOSED",
        message: `Image is overexposed and washed out (mean luminance: ${metrics.meanLuminance}/255). Glare on copper surfaces may simulate spur defects.`,
        canFit: false
      });
    }

    if (clippedShare > C.MAX_CLIPPED_SHARE) {
      issues.push({
        code: "CLIPPED_CONTRAST",
        message: `${metrics.clippedShare}% of pixels have lost dynamic range due to extreme black or white clipping.`,
        canFit: false
      });
    }
  }

  const pass = issues.length === 0;
  return {
    pass,
    issues,
    metrics,
    reason: pass ? null : issues.map(i => i.message).join(" ")
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    checkImageQuality,
    computeLaplacianVariance,
    computeExposureStats
  };
}
