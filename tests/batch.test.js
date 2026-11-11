const test = require("node:test");
const assert = require("node:assert");
const { BatchProcessor } = require("../src/batch-processor.js");

const testMeta = {
  model: { name: "YOLO26s-PCB-Anomaly", version: "2.1.0", commit: "7731565" },
  decision: { threshold: 0.45, borderlineFraction: 0.10 }
};

test("BatchProcessor - enforces max 50 files limit", () => {
  const processor = new BatchProcessor({ maxFiles: 50 });
  const fakeFiles = Array.from({ length: 65 }, (_, i) => ({ name: `file_${i}.jpg`, size: 1000 }));
  const res = processor.addFiles(fakeFiles);
  assert.strictEqual(res.accepted, 50);
  assert.strictEqual(res.rejected, 15);
  assert.strictEqual(processor.items.length, 50);
});

test("BatchProcessor - concurrency 2 and processes 12 mixed files", async () => {
  let activeConcurrency = 0;
  let maxObservedConcurrency = 0;

  // Mock inspector with failures and simulated delay
  async function mockInspect(file) {
    activeConcurrency++;
    maxObservedConcurrency = Math.max(maxObservedConcurrency, activeConcurrency);
    await new Promise(r => setTimeout(r, 20));
    activeConcurrency--;

    if (file.name === "invalid_file.txt") {
      throw new Error("Invalid file format");
    }
    if (file.name === "oversized_board.jpg") {
      throw new Error("File exceeds 4.5 MB limit");
    }
    if (file.name === "network_fail.jpg") {
      throw new Error("Connection timed out");
    }

    // Normal files
    const isDefect = file.name.includes("defect");
    return {
      score: isDefect ? 0.65 : 0.05,
      verdict: isDefect ? "defect" : "pass",
      detections: isDefect ? [{ box: [10, 10, 50, 50], confidence: 0.65 }] : [],
      roundTripMs: 42.5
    };
  }

  const processor = new BatchProcessor({
    concurrency: 2,
    inspectFn: mockInspect,
    meta: testMeta
  });

  // 12 mixed files: 7 pass, 2 defect, 1 invalid, 1 oversized, 1 network fail
  const files = [
    { name: "board_1.jpg", size: 1200 },
    { name: "board_2.jpg", size: 1400 },
    { name: "board_defect_1.jpg", size: 1800 },
    { name: "board_3.jpg", size: 1100 },
    { name: "invalid_file.txt", size: 200 },
    { name: "board_4.jpg", size: 1500 },
    { name: "oversized_board.jpg", size: 5200000 },
    { name: "board_5.jpg", size: 1300 },
    { name: "board_defect_2.jpg", size: 1900 },
    { name: "board_6.jpg", size: 1250 },
    { name: "network_fail.jpg", size: 1450 },
    { name: "board_7.jpg", size: 1350 }
  ];

  processor.addFiles(files);
  await new Promise(resolve => {
    processor.onComplete = resolve;
    processor.run();
  });

  assert.strictEqual(maxObservedConcurrency, 2, "Concurrency must never exceed 2");

  const summary = processor.getSummary();
  assert.strictEqual(summary.counts.total, 12);
  assert.strictEqual(summary.counts.done, 9);
  assert.strictEqual(summary.counts.failed, 3);
  assert.strictEqual(summary.verdicts.defect, 2);
  assert.strictEqual(summary.verdicts.pass, 7);

  // Verify CSV export format
  const csv = processor.exportCsv();
  assert.ok(csv.includes("invalid_file.txt"));
  assert.ok(csv.includes("7731565")); // commit
  assert.ok(csv.includes("2.1.0"));   // version

  // Verify JSON export format
  const json = processor.exportJson();
  assert.strictEqual(json.model.commit, "7731565");
  assert.strictEqual(json.model.version, "2.1.0");
  assert.strictEqual(json.results.length, 12);
});

test("BatchProcessor - cancel operation cancels remaining items", async () => {
  const processor = new BatchProcessor({
    concurrency: 1,
    inspectFn: async () => {
      await new Promise(r => setTimeout(r, 50));
      return { score: 0.1, verdict: "pass" };
    },
    meta: testMeta
  });

  processor.addFiles([
    { name: "f1.jpg", size: 100 },
    { name: "f2.jpg", size: 100 },
    { name: "f3.jpg", size: 100 }
  ]);

  processor.run();
  // Cancel immediately
  processor.cancel();

  const summary = processor.getSummary();
  assert.ok(summary.counts.cancelled >= 1);
});
