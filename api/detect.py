"""PCBGuard detection API for Vercel (ONNX Runtime, CPU).

POST /api/detect?conf=0.45
  body: a 640x640 JPEG (the web page letterboxes the image before sending)
  returns: {"detections": [{"class_id", "name", "confidence", "box": [x1,y1,x2,y2]}], "inference_ms": ...}
Boxes are in 640x640 pixel coordinates.
"""
import io
import json
import os
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import numpy as np
import onnxruntime as ort
from PIL import Image

NAMES = ["missing_hole", "mouse_bite", "open_circuit", "short", "spur", "spurious_copper"]
SIZE = 640
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model", "best.onnx")

_session = None


def get_session():
    global _session
    if _session is None:
        _session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    return _session


def nms(boxes, scores, iou_thr=0.7):
    order = scores.argsort()[::-1]
    areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    keep = []
    while order.size:
        i = order[0]
        keep.append(i)
        if order.size == 1:
            break
        rest = order[1:]
        xx1 = np.maximum(boxes[i, 0], boxes[rest, 0])
        yy1 = np.maximum(boxes[i, 1], boxes[rest, 1])
        xx2 = np.minimum(boxes[i, 2], boxes[rest, 2])
        yy2 = np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / (areas[i] + areas[rest] - inter + 1e-9)
        order = rest[iou <= iou_thr]
    return keep


def decode(out, conf_thr):
    """Handle both ONNX output layouts: end-to-end (1, N, 6) or raw (1, 4+nc, anchors)."""
    out = np.asarray(out)
    if out.ndim == 3 and out.shape[-1] == 6:
        # end-to-end export: rows are [x1, y1, x2, y2, conf, class]
        rows = out[0]
        rows = rows[rows[:, 4] >= conf_thr]
        boxes, confs, cls = rows[:, :4], rows[:, 4], rows[:, 5].astype(int)
    else:
        arr = out[0].T  # (anchors, 4 + nc), boxes as xywh
        scores = arr[:, 4:]
        cls = scores.argmax(1)
        confs = scores.max(1)
        mask = confs >= conf_thr
        arr, cls, confs = arr[mask], cls[mask], confs[mask]
        xywh = arr[:, :4]
        boxes = np.stack([xywh[:, 0] - xywh[:, 2] / 2, xywh[:, 1] - xywh[:, 3] / 2,
                          xywh[:, 0] + xywh[:, 2] / 2, xywh[:, 1] + xywh[:, 3] / 2], axis=1)
        if len(boxes):
            keep = nms(boxes + cls[:, None] * 4096.0, confs)  # class-aware NMS
            boxes, confs, cls = boxes[keep], confs[keep], cls[keep]
    boxes = np.clip(boxes, 0, SIZE)
    return [
        {"class_id": int(c), "name": NAMES[int(c)] if int(c) < len(NAMES) else str(int(c)),
         "confidence": round(float(s), 4), "box": [round(float(v), 1) for v in b]}
        for b, s, c in zip(boxes, confs, cls)
    ]


def run(img_bytes, conf_thr):
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    if img.size != (SIZE, SIZE):
        img = img.resize((SIZE, SIZE))
    x = (np.asarray(img, dtype=np.float32) / 255.0).transpose(2, 0, 1)[None]
    sess = get_session()
    start = time.perf_counter()
    out = sess.run(None, {sess.get_inputs()[0].name: x})[0]
    ms = (time.perf_counter() - start) * 1000
    return decode(out, conf_thr), round(ms, 1)


class handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200, {"status": "ok", "classes": NAMES})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0:
                return self._send(400, {"error": "Empty request body."})
            data = self.rfile.read(length)
            q = parse_qs(urlparse(self.path).query)
            conf_thr = min(max(float(q.get("conf", ["0.45"])[0]), 0.01), 0.99)
            try:
                dets, ms = run(data, conf_thr)
            except OSError:
                return self._send(400, {"error": "Could not read the uploaded file as an image."})
            self._send(200, {"detections": dets, "inference_ms": ms})
        except Exception as e:  # keep the API from crashing silently
            self._send(500, {"error": f"Server error: {e}"})
