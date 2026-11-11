import json
import os
import subprocess
import time
import urllib.request
import websocket # if available or we can use CDP via simple python

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\EdgeCore\157.0.4341.42\msedge.exe"
PORT = 9222

def main():
    print("Starting Edge with remote debugging...")
    proc = subprocess.Popen([
        EDGE_PATH,
        "--headless=new",
        f"--remote-debugging-port={PORT}",
        "--disable-gpu",
        "--window-size=1440,1100",
        "http://localhost:3000"
    ])
    try:
        time.sleep(2)
        # Fetch targets
        resp = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")
        targets = json.loads(resp.read().decode())
        ws_url = targets[0]["webSocketDebuggerUrl"]
        print("Connected to target:", targets[0]["title"])

        import websocket
        ws = websocket.create_connection(ws_url)

        def cdp_send(method, params=None):
            cdp_send.msg_id += 1
            payload = {"id": cdp_send.msg_id, "method": method, "params": params or {}}
            ws.send(json.dumps(payload))
            while True:
                res = json.loads(ws.recv())
                if res.get("id") == cdp_send.msg_id:
                    return res.get("result", {})
        cdp_send.msg_id = 0

        # Enable runtime & network
        cdp_send("Runtime.enable")
        cdp_send("Network.enable")

        def evaluate(expr):
            res = cdp_send("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
            if "exceptionDetails" in res:
                print("JS Exception:", res["exceptionDetails"])
            return res.get("result", {}).get("value")

        # 1. Switch to batch tab
        evaluate("document.getElementById('tabBatch').click();")
        time.sleep(0.5)

        # 2. Add files using sample images
        # We can read samples and load them into File objects in the browser
        evaluate("""
        (async () => {
            const urls = [
                '/samples/sample_clean_1.jpg',
                '/samples/sample_clean_2.jpg',
                '/samples/sample_defect_1.jpg',
                '/samples/sample_defect_2.jpg'
            ];
            const files = [];
            for (const u of urls) {
                const res = await fetch(u);
                const blob = await res.blob();
                const name = u.split('/').pop();
                files.push(new File([blob], name, { type: 'image/jpeg' }));
            }
            // Trigger addBatchFiles
            const input = document.getElementById('batchFileInput');
            // Mock DataTransfer
            const dt = new DataTransfer();
            files.forEach(f => dt.items.add(f));
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        })()
        """)
        time.sleep(1.5)

        # Check total items added
        count = evaluate("document.getElementById('bStatTotal').textContent")
        print(f"Batch total items loaded: {count}")

        # 3. Click Run Batch
        evaluate("document.getElementById('btnBatchRun').click();")
        print("Batch started. Waiting for completion...")

        for _ in range(30):
            time.sleep(1)
            done = evaluate("document.getElementById('bStatDone').textContent")
            failed = evaluate("document.getElementById('bStatFailed').textContent")
            print(f"Progress: done={done}, failed={failed}")
            if done == "4" or (int(done) + int(failed) == 4):
                break

        # 4. Verify Thumbnail Gallery
        thumbCount = evaluate("document.querySelectorAll('.batch-thumb-item').length")
        print(f"Thumbnails in gallery: {thumbCount}")
        assert thumbCount == 4, f"Expected 4 thumbnails, got {thumbCount}"

        gallerySummary = evaluate("document.getElementById('batchGallerySummary').textContent")
        print(f"Gallery summary text: {gallerySummary}")

        # 5. Check Initial Selection
        selectedFilename = evaluate("document.getElementById('bDetFilename').textContent")
        selectedVerdict = evaluate("document.getElementById('bDetVerdict').textContent")
        selectedScore = evaluate("document.getElementById('bDetScore').textContent")
        print(f"Initially selected image: {selectedFilename}, verdict: {selectedVerdict}, score: {selectedScore}")

        # 6. Monitor network calls while switching thumbnails
        # Track if any POST /api/detect is sent
        network_calls = []
        # Listen for requests
        evaluate("""
        window.__networkCount = 0;
        const origFetch = window.fetch;
        window.fetch = function(...args) {
            window.__networkCount++;
            return origFetch.apply(this, args);
        };
        """)

        # 7. Click on thumbnail 3 (sample_defect_1.jpg)
        evaluate("document.querySelectorAll('.batch-thumb-item')[2].click();")
        time.sleep(0.5)

        newSelectedFilename = evaluate("document.getElementById('bDetFilename').textContent")
        newSelectedVerdict = evaluate("document.getElementById('bDetVerdict').textContent")
        newSelectedScore = evaluate("document.getElementById('bDetScore').textContent")
        newSelectedRegions = evaluate("document.getElementById('bDetRegions').textContent")
        fetchCount = evaluate("window.__networkCount")

        print(f"After selecting thumbnail 3:")
        print(f"  Filename: {newSelectedFilename}")
        print(f"  Verdict: {newSelectedVerdict}")
        print(f"  Score: {newSelectedScore}")
        print(f"  Regions: {newSelectedRegions}")
        print(f"  Extra network fetch calls triggered: {fetchCount}")
        assert "defect" in newSelectedFilename.lower()
        assert fetchCount == 0, f"Expected 0 network calls when switching thumbnails, got {fetchCount}"

        # 8. Test overlay toggling
        evaluate("document.getElementById('batchToggleHeatmap').click();")
        time.sleep(0.3)
        evaluate("document.getElementById('batchToggleHeatmap').click();")
        time.sleep(0.3)

        # 9. Verify Table
        tableRows = evaluate("document.querySelectorAll('.batch-table-row').length")
        print(f"Table row count: {tableRows}")
        assert tableRows == 4

        # 10. Click row 4 (sample_defect_2.jpg)
        evaluate("document.querySelectorAll('.batch-table-row')[3].click();")
        time.sleep(0.5)
        rowSelectedFilename = evaluate("document.getElementById('bDetFilename').textContent")
        print(f"After clicking table row 4, selected image: {rowSelectedFilename}")
        assert "sample_defect_2.jpg" in rowSelectedFilename

        # 11. Capture Desktop Screenshot
        shot_res = cdp_send("Page.captureScreenshot", {"format": "png"})
        import base64
        with open(r"C:\Users\Tavish\.gemini\antigravity\brain\7f7ba03e-9898-47da-818e-b7cebc116b8a\batch_redesign_desktop.png", "wb") as f:
            f.write(base64.b64decode(shot_res["data"]))
        print("Desktop screenshot saved.")

        # 12. Set mobile viewport and capture mobile screenshot
        cdp_send("Emulation.setDeviceMetricsOverride", {
            "width": 390,
            "height": 900,
            "deviceScaleFactor": 2,
            "mobile": True
        })
        time.sleep(1)
        shot_mobile = cdp_send("Page.captureScreenshot", {"format": "png"})
        with open(r"C:\Users\Tavish\.gemini\antigravity\brain\7f7ba03e-9898-47da-818e-b7cebc116b8a\batch_redesign_mobile.png", "wb") as f:
            f.write(base64.b64decode(shot_mobile["data"]))
        print("Mobile screenshot saved.")

        print("ALL VERIFICATION CHECKS PASSED!")

    finally:
        proc.terminate()

if __name__ == "__main__":
    main()
