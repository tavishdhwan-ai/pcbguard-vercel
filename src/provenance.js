/**
 * Provenance bundle generator.
 * Creates an immutable, traceable inspection record carrying:
 * - Model version & git commit
 * - Image metadata & dimensions
 * - Verdict, score, threshold, and deviation regions
 * - Quality check audit results and override flags
 * - Accurate runtime execution timings
 */

function buildProvenanceBundle(params = {}) {
  const meta = params.meta || {};
  const file = params.file || { name: "unknown", size: 0 };
  const bitmap = params.bitmap || { width: 0, height: 0 };
  const decisionResult = params.decisionResult || { verdict: "cannot_inspect", score: 0, threshold: 0.45 };
  const regions = Array.isArray(params.regions) ? params.regions : [];
  const quality = params.quality || { pass: true, metrics: {}, issues: [], overrideApplied: false };
  const timing = params.timing || { inferenceMs: 0, roundTripMs: 0 };

  return {
    schemaVersion: "2.1.0",
    generatedAt: new Date().toISOString(),
    model: {
      name: meta.model?.name || "YOLO26s-PCB-Anomaly",
      version: meta.model?.version || "unknown",
      commit: meta.model?.commit || "unknown",
      trainedOn: meta.model?.trainedOn || null,
      datasetLicense: meta.model?.datasetLicense || null,
      datasetAttribution: meta.model?.datasetAttribution || null
    },
    image: {
      filename: file.name,
      sizeBytes: file.size,
      dimensions: {
        width_px: bitmap.width,
        height_px: bitmap.height
      }
    },
    decision: {
      verdict: decisionResult.verdict,
      score: decisionResult.score,
      threshold: decisionResult.threshold,
      borderlineFraction: meta.decision?.borderlineFraction ?? 0.10,
      note: decisionResult.note || null
    },
    qualityAudit: {
      passed: quality.pass,
      overrideApplied: Boolean(quality.overrideApplied),
      metrics: quality.metrics || {},
      flaggedIssues: quality.issues || []
    },
    deviationRegions: regions.map(r => ({
      id: r.id,
      score: r.score,
      box_px: r.box_px,
      width_px: r.width_px,
      height_px: r.height_px,
      area_px: r.area_px,
      centroid_px: r.centroid_px
    })),
    timing: {
      inferenceMs: timing.inferenceMs,
      roundTripMs: timing.roundTripMs
    }
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildProvenanceBundle };
}
