/**
 * Threshold explorer calculation and histogram binning module.
 * Evaluates false-positive rate and miss rate on validation score arrays.
 */

function computeThresholdMetrics(goodScores, defectScores, threshold, defaultThreshold = 0.45, expectedFpr = 0.0) {
  if (!Array.isArray(goodScores) || !Array.isArray(defectScores) || goodScores.length === 0 || defectScores.length === 0) {
    return null;
  }

  // False Positive Rate = Share of good boards falsely flagged (score >= threshold)
  const fpCount = goodScores.filter(s => s >= threshold).length;
  const fpr = fpCount / goodScores.length;

  // Miss Rate (False Negative Rate) = Share of defective boards passed (score < threshold)
  const fnCount = defectScores.filter(s => s < threshold).length;
  const missRate = fnCount / defectScores.length;

  // Histogram binning: 20 bins across [0.0, 1.0]
  const numBins = 20;
  const binWidth = 1.0 / numBins;
  const bins = [];

  for (let b = 0; b < numBins; b++) {
    const binStart = b * binWidth;
    const binEnd = (b + 1) * binWidth;
    const goodCount = goodScores.filter(s => s >= binStart && (b === numBins - 1 ? s <= binEnd : s < binEnd)).length;
    const defectCount = defectScores.filter(s => s >= binStart && (b === numBins - 1 ? s <= binEnd : s < binEnd)).length;

    bins.push({
      binIndex: b,
      start: Number(binStart.toFixed(2)),
      end: Number(binEnd.toFixed(2)),
      goodCount,
      defectCount
    });
  }

  // Check mismatch with metrics.fprAtThreshold at default threshold
  let devWarning = null;
  if (Math.abs(threshold - defaultThreshold) < 1e-4) {
    const diff = Math.abs(fpr - expectedFpr);
    if (diff > 0.01) {
      devWarning = `[DEV WARNING] Computed FPR (${fpr.toFixed(4)}) at default threshold does not match model-meta.json metrics.fprAtThreshold (${expectedFpr.toFixed(4)}).`;
    }
  }

  return {
    threshold: Number(threshold.toFixed(2)),
    fpCount,
    goodTotal: goodScores.length,
    fpr: Number(fpr.toFixed(4)),
    fnCount,
    defectTotal: defectScores.length,
    missRate: Number(missRate.toFixed(4)),
    bins,
    devWarning
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeThresholdMetrics };
}

