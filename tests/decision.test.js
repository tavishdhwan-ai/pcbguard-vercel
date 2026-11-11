const test = require("node:test");
const assert = require("node:assert");
const { decide } = require("../src/decision.js");

const meta = {
  model: { name: "YOLO26s-PCB-Anomaly", version: "2.1.0" },
  decision: { threshold: 0.45, borderlineFraction: 0.10 }
};

test("Decision module - exactly at threshold", () => {
  const res = decide(0.45, meta);
  assert.strictEqual(res.verdict, "defect");
  assert.strictEqual(res.score, 0.45);
  assert.strictEqual(res.threshold, 0.45);
});

test("Decision module - just above threshold", () => {
  const res = decide(0.4501, meta);
  assert.strictEqual(res.verdict, "defect");
});

test("Decision module - just inside borderline band (below threshold)", () => {
  const res = decide(0.4499, meta);
  assert.strictEqual(res.verdict, "borderline");
  assert.strictEqual(res.note, "Close to the threshold. Review manually.");
});

test("Decision module - exactly at lower band boundary (threshold * 0.9 = 0.405)", () => {
  const res = decide(0.405, meta);
  assert.strictEqual(res.verdict, "borderline");
});

test("Decision module - just outside borderline band into pass", () => {
  const res = decide(0.4049, meta);
  assert.strictEqual(res.verdict, "pass");
});

test("Decision module - well within pass (zero score)", () => {
  const res = decide(0.00, meta);
  assert.strictEqual(res.verdict, "pass");
});

test("Decision module - missing meta", () => {
  const res1 = decide(0.50, null);
  assert.strictEqual(res1.verdict, "cannot_inspect");
  assert.strictEqual(res1.threshold, null);

  const res2 = decide(0.50, {});
  assert.strictEqual(res2.verdict, "cannot_inspect");
});

test("Decision module - missing or invalid score", () => {
  const res1 = decide(null, meta);
  assert.strictEqual(res1.verdict, "cannot_inspect");

  const res2 = decide(NaN, meta);
  assert.strictEqual(res2.verdict, "cannot_inspect");
});

test("Decision module - input quality failure override to cannot_inspect", () => {
  const res = decide(0.60, meta, { pass: false, reason: "Image severely blurred" });
  assert.strictEqual(res.verdict, "cannot_inspect");
  assert.strictEqual(res.reason, "Image severely blurred");
});
