/**
 * Constants and thresholds for input image validation and upload fitting.
 * Each constant documents the rationale and calibration basis.
 */
const QUALITY_CONSTANTS = {
  // Model input is 640x640. Images below 300x300 cannot resolve micro-traces or via pads reliably.
  MIN_WIDTH: 300,
  MIN_HEIGHT: 300,

  // Vercel Serverless Function body limit is strictly 4.5 MB (4,718,592 bytes).
  MAX_FILE_BYTES: 4.5 * 1024 * 1024,

  // Allowed file extensions and MIME types.
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp"],
  ALLOWED_EXTENSIONS: /\.(jpe?g|png|webp)$/i,

  // Downscaled canvas dimension for fast Laplacian and luminance analysis in browser.
  ANALYSIS_SIZE: 256,

  // Variance of Laplacian threshold.
  // Calibrated on clean and defect samples (measured var > 120).
  // Images with variance < 45.0 exhibit optical out-of-focus or motion blur.
  BLUR_THRESHOLD: 45.0,

  // Mean luminance threshold [0..255] (ITU-R BT.601 formula).
  // Calibrated on reference PCB photos: normal range is 40.0 to 180.0.
  // Values below 25.0 are severely underexposed; above 230.0 are blown out.
  MIN_MEAN_LUMINANCE: 25.0,
  MAX_MEAN_LUMINANCE: 230.0,

  // Share of clipped pixels (luminance < 5 or > 250).
  // If more than 20% of pixels are clipped, dynamic range is compromised.
  MAX_CLIPPED_SHARE: 0.20,

  // Tolerance for upload fitting score equivalence verification.
  // If downscaling/fitting alters detection score by > 0.02, fitting must not be applied.
  EQUIVALENCE_SCORE_TOLERANCE: 0.02
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { QUALITY_CONSTANTS };
}

