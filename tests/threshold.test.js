const test = require("node:test");
const assert = require("node:assert");
const { computeThresholdMetrics } = require("../src/threshold-explorer.js");

const goodScores = [0.02, 0.04, 0.05, 0.08, 0.11, 0.14, 0.16, 0.19, 0.22, 0.26, 0.31, 0.34];
const defectScores = [0.38, 0.42, 0.46, 0.49, 0.53, 0.58, 0.62, 0.67, 0.73, 0.79, 0.84, 0.91];

test("Threshold explorer - computes rates at default threshold 0.45", () => {
  const res = computeThresholdMetrics(goodScores, defectScores, 0.45, 0.45, 0.0);
  assert.ok(res);
  // All goodScores are < 0.35, so at 0.45 none are flagged -> FPR = 0
  assert.strictEqual(res.fpCount, 0);
  assert.strictEqual(res.fpr, 0.0);

  // Defect scores < 0.45: 0.38 and 0.42 (2 out of 12) -> miss rate = 2/12 = 0.1667
  assert.strictEqual(res.fnCount, 2);
  assert.ok(Math.abs(res.missRate - (2 / 12)) < 0.001);

  // No dev warning since computed FPR 0.0 matches expected 0.0
  assert.strictEqual(res.devWarning, null);
});

test("Threshold explorer - live updates when threshold lowered to 0.20", () => {
  const res = computeThresholdMetrics(goodScores, defectScores, 0.20, 0.45, 0.0);
  assert.ok(res);
  // Good scores >= 0.20: 0.22, 0.26, 0.31, 0.34 (4 out of 12) -> FPR = 4/12 = 0.3333
  assert.strictEqual(res.fpCount, 4);
  assert.ok(Math.abs(res.fpr - (4 / 12)) < 0.001);

  // Defect scores < 0.20: none -> miss rate = 0
  assert.strictEqual(res.fnCount, 0);
  assert.strictEqual(res.missRate, 0.0);
});

test("Threshold explorer - flags dev warning if FPR at default threshold mismatches", () => {
  // Expected FPR is 0.20, but actual is 0.0
  const res = computeThresholdMetrics(goodScores, defectScores, 0.45, 0.45, 0.20);
  assert.ok(res.devWarning);
  assert.match(res.devWarning, /\[DEV WARNING\]/);
});

test("Threshold explorer - returns null when validation arrays missing", () => {
  assert.strictEqual(computeThresholdMetrics(null, defectScores, 0.45), null);
  assert.strictEqual(computeThresholdMetrics(goodScores, [], 0.45), null);
});

