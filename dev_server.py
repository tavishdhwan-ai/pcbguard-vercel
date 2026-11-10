"""Local development server for PCBGuard.
Serves static files from public/ and routes /api/detect to api/detect.py.
"""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from api.detect import handler as DetectHandler

class DevServerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(BASE_DIR, "public"), **kwargs)

    _send = DetectHandler._send

    def do_GET(self):
        if self.path.startswith("/api/detect"):
            DetectHandler.do_GET(self)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/detect"):
            DetectHandler.do_POST(self)
        else:
            self.send_error(404, "Endpoint not found")

def main(port=3000):
    server = HTTPServer(("0.0.0.0", port), DevServerHandler)
    print(f"PCBGuard local server running at http://localhost:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.", flush=True)
        server.server_close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    main(port)
