const test = require("node:test");
const assert = require("node:assert");
const {
  computeLetterboxParams,
  mapToLetterbox,
  mapFromLetterbox,
  mapBoxFromLetterbox,
  getExifRotationDegrees
} = require("../src/alignment.js");
const { deriveDeviationRegions } = require("../src/deviation-regions.js");

function testRoundTrip(origW, origH, testX, testY, tolerance = 0.5) {
  const params = computeLetterboxParams(origW, origH, 640);
  const [lbX, lbY] = mapToLetterbox(testX, testY, params);
  const [reconstructedX, reconstructedY] = mapFromLetterbox(lbX, lbY, params, origW, origH);

  assert.ok(
    Math.abs(reconstructedX - testX) <= tolerance,
    `X mismatch: expected ${testX}, got ${reconstructedX} for size ${origW}x${origH}`
  );
  assert.ok(
    Math.abs(reconstructedY - testY) <= tolerance,
    `Y mismatch: expected ${testY}, got ${reconstructedY} for size ${origW}x${origH}`
  );
}

test("Alignment - Square small (400x400)", () => {
  testRoundTrip(400, 400, 150.0, 250.0);
});

test("Alignment - Square medium (800x800)", () => {
  testRoundTrip(800, 800, 320.5, 540.2);
});

test("Alignment - Square large (1600x1600)", () => {
  testRoundTrip(1600, 1600, 940.0, 1220.0);
});

test("Alignment - Non-square landscape (1200x800, 3:2 aspect)", () => {
  // Height will be padded vertically
  const params = computeLetterboxParams(1200, 800, 640);
  assert.strictEqual(params.padX, 0);
  assert.ok(params.padY > 0, "padY must be positive for 3:2 aspect ratio");
  testRoundTrip(1200, 800, 600.0, 400.0);
  testRoundTrip(1200, 800, 100.0, 750.0);
});

test("Alignment - Non-square portrait (600x900, 2:3 aspect)", () => {
  // Width will be padded horizontally
  const params = computeLetterboxParams(600, 900, 640);
  assert.strictEqual(params.padY, 0);
  assert.ok(params.padX > 0, "padX must be positive for 2:3 aspect ratio");
  testRoundTrip(600, 900, 300.0, 450.0);
  testRoundTrip(600, 900, 50.0, 850.0);
});

test("Alignment - EXIF orientation tag detection", () => {
  assert.strictEqual(getExifRotationDegrees(1), 0);
  assert.strictEqual(getExifRotationDegrees(6), 90);
  assert.strictEqual(getExifRotationDegrees(3), 180);
  assert.strictEqual(getExifRotationDegrees(8), 270);
});

test("Deviation regions - reports pixel dimensions only without defect class labeling", () => {
  const mockDetections = [
    { class_id: 0, name: "missing_hole", confidence: 0.85, box: [100.2, 150.4, 130.8, 180.1] },
    { class_id: 1, name: "mouse_bite", confidence: 0.35, box: [200.0, 220.0, 240.0, 260.0] },
    { class_id: 3, name: "short", confidence: 0.55, box: [400.0, 500.0, 460.0, 520.0] }
  ];

  // Threshold 0.45: items with conf >= 0.45 are included
  const regions = deriveDeviationRegions(mockDetections, 0.45, 800, 800);
  assert.strictEqual(regions.length, 2);

  // Region 1
  assert.strictEqual(regions[0].id, 1);
  assert.strictEqual(regions[0].label, "Deviation region #1");
  assert.strictEqual(regions[0].score, 0.85);
  assert.strictEqual(regions[0].width_px, 31);
  assert.strictEqual(regions[0].height_px, 30);
  assert.strictEqual(regions[0].area_px, 930);
  assert.strictEqual(typeof regions[0].width_px, "number");
  // Check that no mm is reported
  assert.strictEqual(regions[0].width_mm, undefined);

  // Region 2
  assert.strictEqual(regions[1].id, 2);
  assert.strictEqual(regions[1].score, 0.55);
  assert.strictEqual(regions[1].width_px, 60);
  assert.strictEqual(regions[1].height_px, 20);
});

