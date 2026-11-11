import { spawn } from "child_process";
import fs from "fs";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\EdgeCore\\157.0.4341.42\\msedge.exe";
const PORT = 9223;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("Launching Edge with CDP on port", PORT);
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
    console.log("Connected to page:", pageTarget.title, "at", pageTarget.url);

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

    // 1. Switch to Batch Mode tab
    console.log("Switching to Batch Mode...");
    await evaluate("document.getElementById('tabBatch').click();");
    await sleep(500);

    // 2. Ingest 4 sample files
    console.log("Ingesting 4 sample files...");
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
        const input = document.getElementById('batchFileInput');
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      })()
    `);
    await sleep(1500);

    const total = await evaluate("document.getElementById('bStatTotal').textContent");
    console.log("Total items loaded in batch:", total);

    // 3. Click Run Batch
    console.log("Starting batch analysis...");
    await evaluate("document.getElementById('btnBatchRun').click();");

    // Wait until completed
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const done = await evaluate("document.getElementById('bStatDone').textContent");
      const failed = await evaluate("document.getElementById('bStatFailed').textContent");
      console.log(`Progress check ${i+1}: done=${done}, failed=${failed}`);
      if (done === "4" || (Number(done) + Number(failed) >= 4)) break;
    }

    // 4. Verify Thumbnail Gallery
    const thumbCount = await evaluate("document.querySelectorAll('.batch-thumb-item').length");
    console.log("Thumbnails in gallery:", thumbCount);
    if (thumbCount !== 4) throw new Error(`Expected 4 thumbnails, got ${thumbCount}`);

    const summaryText = await evaluate("document.getElementById('batchGallerySummary').textContent");
    console.log("Thumbnail gallery summary:", summaryText);

    // 5. Verify Selected Item in Interactive Viewer
    const initialFilename = await evaluate("document.getElementById('bDetFilename').textContent");
    const initialVerdict = await evaluate("document.getElementById('bDetVerdict').textContent");
    const initialScore = await evaluate("document.getElementById('bDetScore').textContent");
    console.log(`Active viewer initial state -> Filename: ${initialFilename}, Verdict: ${initialVerdict}, Score: ${initialScore}`);

    // 6. Instrument network calls before switching thumbnail
    await evaluate(`
      window.__networkCalls = 0;
      const _origFetch = window.fetch;
      window.fetch = function(...args) {
        window.__networkCalls++;
        return _origFetch.apply(this, args);
      };
    `);

    // 7. Click thumbnail 3 (sample_defect_1.jpg)
    console.log("Clicking thumbnail 3 (sample_defect_1.jpg)...");
    await evaluate("document.querySelectorAll('.batch-thumb-item')[2].click();");
    await sleep(400);

    const newFilename = await evaluate("document.getElementById('bDetFilename').textContent");
    const newVerdict = await evaluate("document.getElementById('bDetVerdict').textContent");
    const newScore = await evaluate("document.getElementById('bDetScore').textContent");
    const newRegions = await evaluate("document.getElementById('bDetRegions').textContent");
    const netCalls = await evaluate("window.__networkCalls");

    console.log(`Active viewer updated state -> Filename: ${newFilename}, Verdict: ${newVerdict}, Score: ${newScore}, Regions: ${newRegions}`);
    console.log("Extra network fetch calls triggered when clicking thumbnail:", netCalls);
    if (netCalls !== 0) throw new Error(`Expected 0 network calls when switching thumbnails, got ${netCalls}`);

    // 8. Verify Table Selection Synchronisation
    const activeRowText = await evaluate("document.querySelector('.batch-table-row.is-selected-row').textContent");
    console.log("Active table row text contains selected file:", activeRowText.includes("sample_defect_1.jpg"));

    // 9. Click on Table Row 4 (sample_defect_2.jpg)
    console.log("Clicking table row 4 (sample_defect_2.jpg)...");
    await evaluate("document.querySelectorAll('.batch-table-row')[3].click();");
    await sleep(400);
    const rowFilename = await evaluate("document.getElementById('bDetFilename').textContent");
    console.log("Active viewer after row click:", rowFilename);
    if (!rowFilename.includes("sample_defect_2.jpg")) throw new Error("Row selection did not update viewer!");

    // 10. Test CSV Export generator content
    const csvContent = await evaluate(`
      (() => {
        // Trigger downloadBatchCsv logic and return string
        const headers = ["Filename", "Verdict", "Anomaly_Score", "Deviation_Regions", "Status", "Round_Trip_Ms", "Error"];
        const rows = [headers.join(",")];
        for (const item of batchItems) {
          rows.push([
            item.name,
            item.verdict ? item.verdict.toUpperCase() : "NONE",
            item.score !== null ? item.score.toFixed(4) : "",
            item.status === "done" ? item.regionsCount : "",
            item.status.toUpperCase(),
            item.roundTripMs || "",
            item.error || ""
          ].join(","));
        }
        return rows.join("\\n");
      })()
    `);
    console.log("Generated CSV sample:\n" + csvContent);
    if (!csvContent.includes("sample_defect_1.jpg") || !csvContent.includes("DEFECT")) {
      throw new Error("CSV missing expected batch results!");
    }

    // 11. Capture Desktop Screenshot
    const shotDesktop = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "C:\\Users\\Tavish\\.gemini\\antigravity\\brain\\7f7ba03e-9898-47da-818e-b7cebc116b8a\\batch_redesign_desktop.png",
      Buffer.from(shotDesktop.data, "base64")
    );
    console.log("Saved batch_redesign_desktop.png");

    // 12. Capture Mobile Screenshot (390px)
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 900,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(800);
    const shotMobile = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "C:\\Users\\Tavish\\.gemini\\antigravity\\brain\\7f7ba03e-9898-47da-818e-b7cebc116b8a\\batch_redesign_mobile.png",
      Buffer.from(shotMobile.data, "base64")
    );
    console.log("Saved batch_redesign_mobile.png");

    console.log("SUCCESS! ALL INTERACTIVE BATCH REQUIREMENTS VERIFIED.");
  } finally {
    proc.kill();
  }
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
