const test = require("node:test");
const assert = require("node:assert");
const { buildProvenanceBundle } = require("../src/provenance.js");

test("Provenance bundle - builds complete traceable report record", () => {
  const meta = {
    model: { name: "YOLO26s-PCB-Anomaly", version: "2.1.0", commit: "7731565" },
    decision: { threshold: 0.45, borderlineFraction: 0.10 }
  };
  const file = { name: "test_board.jpg", size: 450000 };
  const bitmap = { width: 900, height: 900 };
  const decisionResult = { verdict: "defect", score: 0.58, threshold: 0.45 };
  const regions = [
    { id: 1, score: 0.58, box_px: [100, 200, 150, 240], width_px: 50, height_px: 40, area_px: 2000, centroid_px: [125, 220] }
  ];
  const quality = { pass: true, metrics: { blurVariance: 650.0 }, issues: [], overrideApplied: false };
  const timing = { inferenceMs: 198.8, roundTripMs: 242.0 };

  const bundle = buildProvenanceBundle({ meta, file, bitmap, decisionResult, regions, quality, timing });

  assert.strictEqual(bundle.schemaVersion, "2.1.0");
  assert.strictEqual(bundle.model.version, "2.1.0");
  assert.strictEqual(bundle.model.commit, "7731565");
  assert.strictEqual(bundle.decision.verdict, "defect");
  assert.strictEqual(bundle.decision.score, 0.58);
  assert.strictEqual(bundle.image.filename, "test_board.jpg");
  assert.strictEqual(bundle.image.dimensions.width_px, 900);
  assert.strictEqual(bundle.deviationRegions.length, 1);
  assert.strictEqual(bundle.timing.inferenceMs, 198.8);
  assert.strictEqual(bundle.qualityAudit.overrideApplied, false);
});

