/**
 * Coordinate space transforms and alignment calculations between
 * original image space and 640x640 letterbox inference space.
 */

/**
 * Compute forward letterbox parameters.
 */
function computeLetterboxParams(origWidth, origHeight, targetSize = 640) {
  const S = targetSize;
  const scale = Math.min(S / origWidth, S / origHeight);
  const scaledWidth = Math.round(origWidth * scale);
  const scaledHeight = Math.round(origHeight * scale);
  const padX = Math.floor((S - scaledWidth) / 2);
  const padY = Math.floor((S - scaledHeight) / 2);

  return {
    scale,
    scaledWidth,
    scaledHeight,
    padX,
    padY,
    targetSize
  };
}

/**
 * Forward transform: Map point from original image to letterbox space.
 */
function mapToLetterbox(x, y, params) {
  return [
    x * params.scale + params.padX,
    y * params.scale + params.padY
  ];
}

/**
 * Inverse transform: Map point/box from letterbox space back to original image space.
 */
function mapFromLetterbox(x, y, params, origWidth, origHeight) {
  const origX = (x - params.padX) / params.scale;
  const origY = (y - params.padY) / params.scale;
  return [
    Math.max(0, Math.min(origWidth, origX)),
    Math.max(0, Math.min(origHeight, origY))
  ];
}

/**
 * Map bounding box [x1, y1, x2, y2] from letterbox back to original image space.
 */
function mapBoxFromLetterbox(box, params, origWidth, origHeight) {
  const [x1, y1] = mapFromLetterbox(box[0], box[1], params, origWidth, origHeight);
  const [x2, y2] = mapFromLetterbox(box[2], box[3], params, origWidth, origHeight);
  return [x1, y1, x2, y2];
}

/**
 * Handle EXIF orientation transformation (values 1 through 8).
 * Normalizes rotated phone photo coordinates.
 */
function getExifRotationDegrees(orientation) {
  switch (orientation) {
    case 3: return 180;
    case 6: return 90;
    case 8: return 270;
    default: return 0;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeLetterboxParams,
    mapToLetterbox,
    mapFromLetterbox,
    mapBoxFromLetterbox,
    getExifRotationDegrees
  };
}
