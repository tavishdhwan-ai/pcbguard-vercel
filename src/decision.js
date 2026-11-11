/**
 * Pure decision module for PCB anomaly inspection.
 * Returns verdict: 'pass' | 'borderline' | 'defect' | 'cannot_inspect'
 */
function decide(score, meta, qualityResult) {
  // If input quality check failed, signal cannot_inspect
  if (qualityResult && qualityResult.pass === false) {
    return {
      verdict: "cannot_inspect",
      score: typeof score === "number" ? score : null,
      threshold: meta?.decision?.threshold ?? null,
      reason: qualityResult.reason || "Input quality check failed"
    };
  }

  // Score must be a valid number
  if (score === null || score === undefined || typeof score !== "number" || isNaN(score)) {
    return {
      verdict: "cannot_inspect",
      score: null,
      threshold: meta?.decision?.threshold ?? null,
      reason: "Missing or invalid anomaly score"
    };
  }

  // Meta and decision threshold must exist
  if (!meta || !meta.decision || typeof meta.decision.threshold !== "number" || isNaN(meta.decision.threshold)) {
    return {
      verdict: "cannot_inspect",
      score,
      threshold: null,
      reason: "Missing decision metadata or threshold"
    };
  }

  const threshold = meta.decision.threshold;
  const fraction = typeof meta.decision.borderlineFraction === "number" ? meta.decision.borderlineFraction : 0.10;
  // Borderline band is within `fraction` below the threshold: [threshold * (1 - fraction), threshold)
  const lowerBand = threshold * (1 - fraction);

  // Floating point precision epsilon for exact boundary comparisons
  const EPS = 1e-9;

  if (score >= threshold - EPS) {
    return {
      verdict: "defect",
      score,
      threshold,
      lowerBand
    };
  }

  if (score >= lowerBand - EPS) {
    return {
      verdict: "borderline",
      score,
      threshold,
      lowerBand,
      note: "Close to the threshold. Review manually."
    };
  }

  return {
    verdict: "pass",
    score,
    threshold,
    lowerBand
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { decide };
}

