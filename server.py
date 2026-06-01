"""
GPRS Dashboard — servidor Python puro (sem dependências externas)
Recebe dados do ESP32/GPRS via HTTP GET ou POST e serve o dashboard.
"""
import json, os, threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime

PORT       = int(os.environ.get("PORT", 3000))
DATA_FILE  = os.path.join(os.path.dirname(__file__), "readings.json")
MAX_READINGS = 200
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")

lock     = threading.Lock()
readings = []

# ── Carrega leituras salvas ──────────────────────────────────────────────────
if os.path.exists(DATA_FILE):
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            readings = json.load(f)
    except Exception:
        readings = []

def save_readings():
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(readings[-MAX_READINGS:], f)

def parse_reading(params, client_ip):
    def f(key, *aliases):
        for k in (key, *aliases):
            if k in params:
                v = params[k]
                return float(v[0]) if isinstance(v, list) else float(v)
        return 0.0

    def i(key, *aliases):
        for k in (key, *aliases):
            if k in params:
                v = params[k]
                return int(float(v[0] if isinstance(v, list) else v))
        return 0

    return {
        "timestamp":  datetime.now().isoformat(),
        "temp":       f("temp",  "temp_amb"),
        "umid":       f("umid"),
        "baro":       f("baro"),
        "alt":        f("alt",   "altim"),
        "volt":       f("volt",  "tensao"),
        "p1":         f("p1",    "pressao1"),
        "p2":         f("p2",    "pressao2"),
        "motor":      f("motor"),
        "lat":        f("lat"),
        "lon":        f("lon"),
        "sinal":      i("sinal", "gsm_sinal"),
        "chip":       i("chip",  "gsm_chip"),
        "coletando":  i("coletando"),
        "ip":         client_ip,
    }

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def log_message(self, fmt, *args):
        pass  # silencia log padrão — só usamos o nosso

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    # ── GET ──────────────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path

        if path == "/data":
            params = parse_qs(parsed.query)
            self._ingest(params)
            return

        if path == "/api/readings":
            with lock:
                data = list(readings)
            self.send_json(data)
            return

        if path == "/api/latest":
            with lock:
                data = readings[-1] if readings else None
            self.send_json(data)
            return

        if path == "/api/clear":
            with lock:
                readings.clear()
            save_readings()
            self.send_json({"ok": True})
            return

        # Serve arquivos estáticos (index.html, etc.)
        super().do_GET()

    # ── POST ─────────────────────────────────────────────────────────────────
    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/data":
            self.send_json({"error": "not found"}, 404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length).decode("utf-8", errors="replace") if length else ""
        ct     = self.headers.get("Content-Type", "")

        if "application/json" in ct:
            try:
                params = {k: v for k, v in json.loads(body).items()}
            except Exception:
                params = {}
        else:
            params = parse_qs(body)

        self._ingest(params)

    # ── Ingere uma leitura ───────────────────────────────────────────────────
    def _ingest(self, params):
        client_ip = self.client_address[0]
        reading   = parse_reading(params, client_ip)

        with lock:
            readings.append(reading)
            if len(readings) > MAX_READINGS:
                readings.pop(0)

        save_readings()

        ts = datetime.fromisoformat(reading["timestamp"]).strftime("%d/%m/%Y %H:%M:%S")
        print(f"[{ts}]  Temp:{reading['temp']:.1f}°C  Volt:{reading['volt']:.1f}V"
              f"  Sinal:{reading['sinal']}/31  IP:{client_ip}")

        self.send_json({"ok": True, "total": len(readings)})


if __name__ == "__main__":
    import socket

    server = HTTPServer(("0.0.0.0", PORT), Handler)

    # Descobre IPs locais
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    print("\n=== GPRS Dashboard ===")
    print(f"  Local : http://localhost:{PORT}")
    for ip in ips:
        print(f"  Rede  : http://{ip}:{PORT}")
    print(f"\n  Endpoint ESP32:")
    ip_ex = ips[0] if ips else "<SEU-IP>"
    print(f"  http://{ip_ex}:{PORT}/data?temp=25&umid=60&baro=1013&alt=500"
          f"&volt=220&p1=10.5&p2=10.3&motor=75&lat=-23.5&lon=-46.6&sinal=18&chip=1&coletando=1")
    print("\n  Ctrl+C para parar.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
