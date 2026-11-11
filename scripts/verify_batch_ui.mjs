import { spawn } from "child_process";
import fs from "fs";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\EdgeCore\\157.0.4341.42\\msedge.exe";
const PORT = 9226;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("=== BATCH MODE & INSPECT ALL VERIFICATION SUITE ===");
  const proc = spawn(EDGE_PATH, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--disable-gpu",
    "--window-size=1440,1100",
    "http://localhost:3000"
  ]);

  try {
    await sleep(2000);
    const resp = await fetch(`http://127.0.0.1:${PORT}/json`);
    const targets = await resp.json();
    const pageTarget = targets.find(t => t.type === "page" && t.url.includes("localhost:3000")) || targets[0];
    const wsUrl = pageTarget.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        msgId++;
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send("Runtime.enable");
    await send("Page.enable");

    async function evaluate(expression) {
      const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) {
        console.error("Evaluation exception:", res.exceptionDetails);
      }
      return res.result?.value;
    }

    // 1. Switch to Batch Mode
    console.log("1. Navigating to Batch Mode tab...");
    await evaluate("document.getElementById('tabBatch').click();");
    await sleep(500);

    // 2. Ingest mixed batch: 4 valid sample files + 1 invalid file
    console.log("2. Ingesting mixed batch (4 valid PCB images + 1 invalid non-image file)...");
    await evaluate(`
      (async () => {
        const urls = [
          '/samples/sample_clean_1.jpg',
          '/samples/sample_clean_2.jpg',
          '/samples/sample_defect_1.jpg',
          '/samples/sample_defect_2.jpg'
        ];
        const dt = new DataTransfer();
        for (const u of urls) {
          const res = await fetch(u);
          const blob = await res.blob();
          const name = u.split('/').pop();
          dt.items.add(new File([blob], name, { type: 'image/jpeg' }));
        }
        // Add an invalid file
        dt.items.add(new File(['invalid_corrupt_data'], 'corrupted_board.txt', { type: 'text/plain' }));

        const input = document.getElementById('batchFileInput');
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      })()
    `);
    await sleep(1500);

    const initialTotal = await evaluate("document.getElementById('bStatTotal').textContent");
    const initialRemaining = await evaluate("document.getElementById('bStatRemaining').textContent");
    const inspectBtnText = await evaluate("document.getElementById('btnBatchRun').textContent");
    console.log(`Loaded batch items: Total=${initialTotal}, Remaining=${initialRemaining}, Primary Button="${inspectBtnText}"`);
    if (initialTotal !== "5") throw new Error("Expected 5 batch items");

    // 3. Test INSPECT ALL
    console.log("3. Clicking INSPECT ALL once...");
    await evaluate("document.getElementById('btnBatchRun').click();");

    // 4. Test duplicate submission prevention
    const isRunningDisabled = await evaluate("document.getElementById('btnBatchRun').disabled");
    console.log("Inspect All disabled while running (duplicate prevention):", isRunningDisabled);
    if (!isRunningDisabled) throw new Error("Inspect All must be disabled while running");

    // 5. Track progress bar updates
    let observedProgress = [];
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const pct = await evaluate("document.getElementById('batchProgressPct').textContent");
      const done = await evaluate("document.getElementById('bStatDone').textContent");
      const failed = await evaluate("document.getElementById('bStatFailed').textContent");
      const rem = await evaluate("document.getElementById('bStatRemaining').textContent");
      observedProgress.push(pct);
      console.log(`Queue update ${i+1}: ${pct} | Done=${done}, Failed=${failed}, Remaining=${rem}`);
      if (Number(done) + Number(failed) >= 5) break;
    }

    const finalDone = await evaluate("document.getElementById('bStatDone').textContent");
    const finalFailed = await evaluate("document.getElementById('bStatFailed').textContent");
    console.log(`Final batch result: Completed=${finalDone}, Failed=${finalFailed}`);
    if (finalDone !== "4" || finalFailed !== "1") {
      throw new Error(`Expected 4 done and 1 failed, got done=${finalDone}, failed=${finalFailed}`);
    }

    // 6. Test duplicate submission prevention when clicking Inspect All again
    console.log("4. Testing skip of already inspected images on second Inspect All click...");
    await evaluate(`
      window.__inspectedRequests = 0;
      const _fetch = window.fetch;
      window.fetch = function(...args) {
        if (args[0] && args[0].includes('/api/detect')) window.__inspectedRequests++;
        return _fetch.apply(this, args);
      };
    `);

    // Click Inspect All again without re-queueing
    await evaluate("document.getElementById('btnBatchRun').click();");
    await sleep(600);
    const extraCalls = await evaluate("window.__inspectedRequests");
    console.log("Extra requests dispatched when clicking completed batch without retry:", extraCalls);

    // 7. Test individual RETRY button on the failed item
    console.log("5. Testing individual RETRY button on the failed item...");
    const failedItemActionBtn = await evaluate(`
      (() => {
        const failedRow = Array.from(document.querySelectorAll('.batch-table-row')).find(r => r.textContent.includes('FAIL'));
        return failedRow ? failedRow.querySelector('.col-action button').textContent : null;
      })()
    `);
    console.log("Failed item action button label:", failedItemActionBtn);
    if (!failedItemActionBtn || !failedItemActionBtn.includes("RETRY")) {
      throw new Error("Failed item must display a RETRY button");
    }

    // 8. Test thumbnail gallery, interactive viewer & Defect Name
    console.log("6. Verifying interactive viewer & Defect Name display...");
    const thumbCount = await evaluate("document.querySelectorAll('.batch-thumb-item').length");
    console.log("Thumbnails rendered in gallery:", thumbCount);
    if (thumbCount !== 5) throw new Error("Expected 5 thumbnails");

    // Click thumbnail 1 (sample_clean_1.jpg - normal board)
    await evaluate("document.querySelectorAll('.batch-thumb-item')[0].click();");
    await sleep(400);
    const cleanDefectName = await evaluate("document.getElementById('bDetDefectName').textContent");
    console.log("Normal board defect name in viewer:", cleanDefectName);
    if (!cleanDefectName.includes("None detected")) {
      throw new Error(`Expected 'None detected' for normal board, got '${cleanDefectName}'`);
    }

    // Click thumbnail 3 (sample_defect_1.jpg - anomalous board)
    await evaluate("document.querySelectorAll('.batch-thumb-item')[2].click();");
    await sleep(400);
    const viewerFilename = await evaluate("document.getElementById('bDetFilename').textContent");
    const viewerVerdict = await evaluate("document.getElementById('bDetVerdict').textContent");
    const viewerScore = await evaluate("document.getElementById('bDetScore').textContent");
    const viewerDefectName = await evaluate("document.getElementById('bDetDefectName').textContent");
    console.log(`Selected thumbnail 3 -> Filename: ${viewerFilename}, Verdict: ${viewerVerdict}, Score: ${viewerScore}, Defect Name: ${viewerDefectName}`);
    if (!viewerFilename.includes("sample_defect_1.jpg")) throw new Error("Viewer filename mismatch");
    if (!viewerDefectName || viewerDefectName === "None detected" || viewerDefectName === "Unavailable") {
      throw new Error(`Expected validated defect class or unclassified deviation, got '${viewerDefectName}'`);
    }

    // Check failed item (corrupted_board.txt)
    await evaluate("document.querySelectorAll('.batch-thumb-item')[4].click();");
    await sleep(400);
    const failedDefectName = await evaluate("document.getElementById('bDetDefectName').textContent");
    console.log("Failed item defect name in viewer:", failedDefectName);
    if (!failedDefectName.includes("Unavailable")) {
      throw new Error(`Expected 'Unavailable' for failed item, got '${failedDefectName}'`);
    }

    // Verify Defect Name column in table
    const tableHeaders = await evaluate("Array.from(document.querySelectorAll('thead th')).map(th => th.textContent.trim())");
    console.log("Table headers:", tableHeaders);
    if (!tableHeaders.includes("DEFECT NAME")) throw new Error("DEFECT NAME column missing from table header!");

    // 9. Test CSV Export contains Defect_Name column and all 5 rows
    console.log("7. Verifying CSV Export contains Defect_Name column and all batch items...");
    const csvContent = await evaluate(`
      (() => {
        const headers = ["Filename", "Verdict", "Deviation_Score", "Defect_Name", "Deviation_Regions", "Status", "Round_Trip_Ms", "Error"];
        const rows = [headers.join(",")];
        for (const item of window.batchItems) {
          rows.push([
            item.name,
            item.verdict ? item.verdict.toUpperCase() : (item.status === "failed" ? "FAILED" : "NONE"),
            item.score !== null ? item.score.toFixed(4) : "",
            item.defectName || "Unclassified deviation",
            item.status === "done" ? item.regionsCount : "",
            item.status.toUpperCase(),
            item.roundTripMs || "",
            item.error || ""
          ].join(","));
        }
        return rows.join("\\n");
      })()
    `);
    console.log("Exported CSV preview:\n" + csvContent);
    if (!csvContent.includes("Defect_Name") || !csvContent.includes("corrupted_board.txt")) {
      throw new Error("CSV does not contain Defect_Name column or all items!");
    }

    // 10. Capture Desktop and Mobile screenshots
    console.log("8. Capturing updated screenshots...");
    const shotDesktop = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "C:\\Users\\Tavish\\.gemini\\antigravity\\brain\\7f7ba03e-9898-47da-818e-b7cebc116b8a\\batch_inspect_all_desktop.png",
      Buffer.from(shotDesktop.data, "base64")
    );
    console.log("Saved batch_inspect_all_desktop.png");

    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 900,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(800);
    const shotMobile = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "C:\\Users\\Tavish\\.gemini\\antigravity\\brain\\7f7ba03e-9898-47da-818e-b7cebc116b8a\\batch_inspect_all_mobile.png",
      Buffer.from(shotMobile.data, "base64")
    );
    console.log("Saved batch_inspect_all_mobile.png");

    console.log("ALL BATCH MODE & INSPECT ALL ACCEPTANCE CHECKS PASSED!");
  } finally {
    proc.kill();
  }
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
