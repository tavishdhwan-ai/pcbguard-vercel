const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { checkImageQuality, computeLaplacianVariance, computeExposureStats } = require("../src/quality-checker.js");

test("Quality checker - valid image passes all checks", () => {
  const meta = { name: "pcb_test.jpg", size: 1.2 * 1024 * 1024, width: 900, height: 900 };
  // Mock pixelData with good sharpness (checkerboard pattern) and normal exposure
  const W = 64, H = 64;
  const raw = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const v = (x % 4 === 0 || y % 4 === 0) ? 180 : 80;
      raw[idx] = v;
      raw[idx + 1] = v;
      raw[idx + 2] = v;
      raw[idx + 3] = 255;
    }
  }

  const res = checkImageQuality(meta, { data: raw, width: W, height: H });
  assert.strictEqual(res.pass, true);
  assert.strictEqual(res.issues.length, 0);
  assert.strictEqual(res.reason, null);
});

test("Quality checker - detects oversized file (> 4.5 MB)", () => {
  const meta = { name: "large_board.jpg", size: 5.2 * 1024 * 1024, width: 2400, height: 2400 };
  const res = checkImageQuality(meta);
  assert.strictEqual(res.pass, false);
  const issue = res.issues.find(i => i.code === "OVERSIZED");
  assert.ok(issue);
  assert.match(issue.message, /4\.5 MB/);
});

test("Quality checker - detects unsupported format", () => {
  const meta = { name: "inspection_report.pdf", size: 500 * 1024, width: 800, height: 600 };
  const res = checkImageQuality(meta);
  assert.strictEqual(res.pass, false);
  const issue = res.issues.find(i => i.code === "INVALID_FORMAT");
  assert.ok(issue);
});

test("Quality checker - detects low resolution (< 300x300)", () => {
  const meta = { name: "thumbnail.jpg", size: 50 * 1024, width: 200, height: 180 };
  const res = checkImageQuality(meta);
  assert.strictEqual(res.pass, false);
  const issue = res.issues.find(i => i.code === "LOW_RESOLUTION");
  assert.ok(issue);
});

test("Quality checker - detects severe blur (low Laplacian variance)", () => {
  const meta = { name: "blurry.jpg", size: 200 * 1024, width: 800, height: 800 };
  // Uniform flat color has zero variance
  const W = 64, H = 64;
  const flat = new Uint8ClampedArray(W * H * 4);
  flat.fill(100);
  const res = checkImageQuality(meta, { data: flat, width: W, height: H });
  assert.strictEqual(res.pass, false);
  const issue = res.issues.find(i => i.code === "BLURRED");
  assert.ok(issue);
});

test("Quality checker - detects underexposure and clipping", () => {
  const meta = { name: "dark.jpg", size: 200 * 1024, width: 800, height: 800 };
  const W = 64, H = 64;
  const dark = new Uint8ClampedArray(W * H * 4);
  dark.fill(4); // clipped black
  const res = checkImageQuality(meta, { data: dark, width: W, height: H });
  assert.strictEqual(res.pass, false);
  const issue = res.issues.find(i => i.code === "UNDEREXPOSED");
  assert.ok(issue);
});
