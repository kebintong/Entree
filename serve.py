"""Local dev server for Entree that never lets the browser cache files.

Use this instead of `py -m http.server` so edits always show up on a normal refresh.

    cd "D:\\Clark pt2\\Entree\\Entree"
    py serve.py            (serves on port 1000)
    py serve.py 8085       (or pick a port)

Then open http://localhost:1000/pages/index.html
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # Ignore If-Modified-Since so the browser always gets the fresh file
    def send_head(self):
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    server = http.server.ThreadingHTTPServer(("", port), NoCacheHandler)
    print(f"Serving Entree with caching disabled on http://localhost:{port}/pages/index.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
