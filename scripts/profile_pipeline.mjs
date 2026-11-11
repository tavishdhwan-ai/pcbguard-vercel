import { spawn } from "child_process";
import fs from "fs";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\EdgeCore\\157.0.4341.42\\msedge.exe";
const PORT = 9225;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("Starting Edge for detailed profiling...");
  const proc = spawn(EDGE_PATH, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--disable-gpu",
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

    async function evaluate(expression) {
      const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) {
        console.error("Evaluation exception:", res.exceptionDetails);
      }
      return res.result?.value;
    }

    // Instrument the browser pipeline for 5 images
    console.log("Running pipeline instrumentation across 5 images...");
    const profileResults = await evaluate(`
      (async () => {
        const urls = [
          '/samples/sample_clean_1.jpg',
          '/samples/sample_clean_2.jpg',
          '/samples/sample_defect_1.jpg',
          '/samples/sample_defect_2.jpg',
          '/samples/sample_clean_1.jpg' // representative 5th image
        ];

        const measurements = [];

        for (let i = 0; i < urls.length; i++) {
          const u = urls[i];
          const name = u.split('/').pop() + ' (run ' + (i+1) + ')';
          const fileResp = await fetch(u);
          const rawBlob = await fileResp.blob();
          const file = new File([rawBlob], name, { type: 'image/jpeg' });

          const tStart = performance.now();

          // 1. Browser preparation (createImageBitmap + letterbox canvas + toBlob)
          const tPrepStart = performance.now();
          const bmp = await createImageBitmap(file);
          const S = 640;
          const scale = Math.min(S / bmp.width, S / bmp.height);
          const w = Math.round(bmp.width * scale);
          const h = Math.round(bmp.height * scale);
          const padX = Math.floor((S - w) / 2);
          const padY = Math.floor((S - h) / 2);

          const off = document.createElement("canvas");
          off.width = S; off.height = S;
          const g = off.getContext("2d");
          g.fillStyle = "rgb(114,114,114)";
          g.fillRect(0, 0, S, S);
          g.drawImage(bmp, padX, padY, w, h);

          const blob = await new Promise(r => off.toBlob(r, "image/jpeg", 0.95));
          const tPrepEnd = performance.now();
          const prepMs = tPrepEnd - tPrepStart;

          // 2. Network upload + server endpoint wait
          const tNetStart = performance.now();
          const res = await fetch('/api/detect?conf=0.45', {
            method: 'POST',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blob
          });
          const data = await res.json();
          const tNetEnd = performance.now();
          const netWaitMs = tNetEnd - tNetStart;
          const inferenceMs = data.inference_ms || 0;
          // Approximate upload/transmission vs server wait
          const uploadMs = Math.max(2, netWaitMs - inferenceMs);

          // 3. Response processing and rendering
          const tPostStart = performance.now();
          const dets = data.detections || [];
          const derived = dets.map(d => ({
            box: [(d.box[0]-padX)/scale, (d.box[1]-padY)/scale, (d.box[2]-padX)/scale, (d.box[3]-padY)/scale],
            score: d.confidence
          }));
          const tPostEnd = performance.now();
          const postRenderMs = tPostEnd - tPostStart;

          const totalMs = performance.now() - tStart;

          measurements.push({
            image: name,
            prepMs: Number(prepMs.toFixed(1)),
            uploadMs: Number(uploadMs.toFixed(1)),
            netWaitMs: Number(netWaitMs.toFixed(1)),
            inferenceMs: Number(inferenceMs.toFixed(1)),
            postRenderMs: Number(postRenderMs.toFixed(1)),
            totalMs: Number(totalMs.toFixed(1))
          });
        }
        return measurements;
      })()
    `);

    console.log("=== PER-IMAGE INFERENCE PIPELINE MEASUREMENTS (BEFORE) ===");
    console.table(profileResults);

  } finally {
    proc.kill();
  }
}

main().catch(console.error);
