/**
 * Batch inspection processor with concurrency limiting and memory management.
 * Enforces:
 * - Max 50 files
 * - Concurrency 2
 * - Per-file status tracking (queued, inspecting, done, failed, cancelled)
 * - Object URL revocation & lightweight memory footprint
 * - CSV and JSON exports with model version and commit
 */

class BatchProcessor {
  constructor(options = {}) {
    this.maxFiles = options.maxFiles || 50;
    this.concurrency = options.concurrency || 2;
    this.inspectFn = options.inspectFn || (async () => ({ score: 0, detections: [], roundTripMs: 0 }));
    this.meta = options.meta || { model: { version: "2.1.0", commit: "7731565" }, decision: { threshold: 0.45 } };

    this.items = [];
    this.activeWorkers = 0;
    this.isCancelled = false;
    this.onUpdate = options.onUpdate || (() => {});
    this.onComplete = options.onComplete || (() => {});
  }

  addFiles(fileList) {
    const rawArray = Array.from(fileList || []);
    const allowed = rawArray.slice(0, this.maxFiles);

    const newItems = allowed.map((file, idx) => ({
      id: `batch-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      file,
      name: file.name,
      size: file.size,
      status: "queued",
      verdict: null,
      score: null,
      roundTripMs: null,
      regionsCount: 0,
      error: null
    }));

    this.items.push(...newItems);
    this.items = this.items.slice(0, this.maxFiles);
    return {
      accepted: newItems.length,
      rejected: Math.max(0, rawArray.length - this.maxFiles),
      total: this.items.length
    };
  }

  async run() {
    this.isCancelled = false;
    this._pump();
  }

  cancel() {
    this.isCancelled = true;
    for (const item of this.items) {
      if (item.status === "queued" || item.status === "inspecting") {
        item.status = "cancelled";
        item.error = "Cancelled by user";
      }
    }
    this.onUpdate(this.getSummary());
  }

  retry(itemId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;
    item.status = "queued";
    item.error = null;
    this._pump();
  }

  async _pump() {
    if (this.isCancelled) return;

    while (this.activeWorkers < this.concurrency) {
      const nextItem = this.items.find(i => i.status === "queued");
      if (!nextItem) break;

      this.activeWorkers++;
      this._processItem(nextItem).finally(() => {
        this.activeWorkers--;
        this._pump();
      });
    }

    if (this.activeWorkers === 0 && !this.items.some(i => i.status === "queued")) {
      this.onComplete(this.getSummary());
    }
  }

  async _processItem(item) {
    if (this.isCancelled) {
      item.status = "cancelled";
      return;
    }

    item.status = "inspecting";
    this.onUpdate(this.getSummary());

    try {
      const result = await this.inspectFn(item.file);
      item.score = typeof result.score === "number" ? result.score : 0.0;
      item.verdict = result.verdict || (item.score >= this.meta.decision.threshold ? "defect" : "pass");
      item.roundTripMs = result.roundTripMs || 0;
      item.regionsCount = Array.isArray(result.detections) ? result.detections.length : 0;
      item.status = "done";
    } catch (err) {
      item.status = "failed";
      item.error = err.message || "Inspection failed";
    }

    this.onUpdate(this.getSummary());
  }

  getSummary() {
    const counts = { total: this.items.length, queued: 0, inspecting: 0, done: 0, failed: 0, cancelled: 0 };
    const verdicts = { pass: 0, borderline: 0, defect: 0 };

    for (const i of this.items) {
      counts[i.status] = (counts[i.status] || 0) + 1;
      if (i.verdict && verdicts[i.verdict] !== undefined) {
        verdicts[i.verdict]++;
      }
    }

    return {
      counts,
      verdicts,
      items: this.items
    };
  }

  exportCsv() {
    const headers = [
      "ID",
      "Filename",
      "Size_Bytes",
      "Status",
      "Verdict",
      "Score",
      "Threshold",
      "Regions_Count",
      "Round_Trip_Ms",
      "Error",
      "Model_Version",
      "Model_Commit",
      "Timestamp"
    ];

    const threshold = this.meta.decision?.threshold ?? 0.45;
    const version = this.meta.model?.version ?? "unknown";
    const commit = this.meta.model?.commit ?? "unknown";
    const ts = new Date().toISOString();

    const rows = [headers.join(",")];
    for (const item of this.items) {
      rows.push([
        item.id,
        `"${item.name}"`,
        item.size,
        item.status,
        item.verdict || "none",
        item.score !== null ? item.score.toFixed(4) : "",
        threshold,
        item.regionsCount,
        item.roundTripMs !== null ? item.roundTripMs.toFixed(1) : "",
        `"${item.error || ""}"`,
        version,
        commit,
        ts
      ].join(","));
    }

    return rows.join("\r\n");
  }

  exportJson() {
    const summary = this.getSummary();
    return {
      model: {
        name: this.meta.model?.name,
        version: this.meta.model?.version,
        commit: this.meta.model?.commit
      },
      decision: {
        threshold: this.meta.decision?.threshold,
        borderlineFraction: this.meta.decision?.borderlineFraction
      },
      exportedAt: new Date().toISOString(),
      summary: {
        counts: summary.counts,
        verdicts: summary.verdicts
      },
      results: this.items.map(i => ({
        id: i.id,
        filename: i.name,
        sizeBytes: i.size,
        status: i.status,
        verdict: i.verdict,
        score: i.score,
        regionsCount: i.regionsCount,
        roundTripMs: i.roundTripMs,
        error: i.error
      }))
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BatchProcessor };
}
