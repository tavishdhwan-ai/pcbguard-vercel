/**
 * Deviation regions extractor.
 * Adheres strictly to the one-class anomaly model contract:
 * - Detects anomalous regions without fabricating defect classes, causes, or severity.
 * - Labels areas strictly as "deviation regions".
 * - Reports sizes and coordinates strictly in pixels (no mm).
 */

function deriveDeviationRegions(detections, threshold = 0.45, imageWidth = 0, imageHeight = 0) {
  if (!Array.isArray(detections)) return [];

  // Cutoff rule: only detections with confidence >= threshold are classified as active deviations
  const active = detections.filter(d => typeof d.confidence === "number" && d.confidence >= threshold);

  return active.map((d, index) => {
    const box = Array.isArray(d.box) ? d.box : [0, 0, 0, 0];
    const x1 = Math.round(box[0]);
    const y1 = Math.round(box[1]);
    const x2 = Math.round(box[2]);
    const y2 = Math.round(box[3]);
    const width_px = Math.max(1, x2 - x1);
    const height_px = Math.max(1, y2 - y1);
    const area_px = width_px * height_px;
    const centroid_x_px = Math.round(x1 + width_px / 2);
    const centroid_y_px = Math.round(y1 + height_px / 2);

    return {
      id: index + 1,
      label: `Deviation region #${index + 1}`,
      score: Number(d.confidence.toFixed(4)),
      box_px: [x1, y1, x2, y2],
      centroid_px: [centroid_x_px, centroid_y_px],
      width_px,
      height_px,
      area_px,
      // Deviation cutoff applied
      cutoff: threshold
    };
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { deriveDeviationRegions };
}
