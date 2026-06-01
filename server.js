const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'readings.json');
const MAX_READINGS = 200;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Carrega leituras salvas (sobrevive a reinicialização do servidor) ──────────
let readings = [];
if (fs.existsSync(DATA_FILE)) {
  try { readings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) { readings = []; }
}

function saveReadings() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(readings.slice(-MAX_READINGS)));
}

// ── Endpoint principal: recebe dados do ESP32 via GET ou POST ─────────────────
// Exemplo GET:  /data?temp=25.3&umid=60&baro=1013&alt=500&volt=220&p1=10.5&p2=10.3&motor=75&lat=-23.5&lon=-46.6&sinal=18&chip=1&coletando=1
// Exemplo POST: mesmos campos no body JSON ou form-urlencoded
function handleData(req, res) {
  const p = { ...req.query, ...req.body };

  const reading = {
    timestamp:  new Date().toISOString(),
    temp:       parseFloat(p.temp   ?? p.temp_amb  ?? 0),
    umid:       parseFloat(p.umid   ?? 0),
    baro:       parseFloat(p.baro   ?? 0),
    alt:        parseFloat(p.alt    ?? p.altim     ?? 0),
    volt:       parseFloat(p.volt   ?? p.tensao    ?? 0),
    p1:         parseFloat(p.p1     ?? p.pressao1  ?? 0),
    p2:         parseFloat(p.p2     ?? p.pressao2  ?? 0),
    motor:      parseFloat(p.motor  ?? 0),
    lat:        parseFloat(p.lat    ?? 0),
    lon:        parseFloat(p.lon    ?? 0),
    sinal:      parseInt  (p.sinal  ?? p.gsm_sinal ?? 0),
    chip:       parseInt  (p.chip   ?? p.gsm_chip  ?? 0),
    coletando:  parseInt  (p.coletando ?? 0),
    ip:         req.ip,
  };

  readings.push(reading);
  if (readings.length > MAX_READINGS) readings.shift();
  saveReadings();

  const ts = new Date(reading.timestamp).toLocaleString('pt-BR');
  console.log(`[${ts}] Novo dado — Temp:${reading.temp}°C  Volt:${reading.volt}V  Sinal:${reading.sinal}/31  IP:${reading.ip}`);

  res.json({ ok: true, total: readings.length });
}

app.get ('/data', handleData);
app.post('/data', handleData);

// ── API de leitura para o dashboard ──────────────────────────────────────────
app.get('/api/readings', (_req, res) => {
  res.json(readings);
});

app.get('/api/latest', (_req, res) => {
  if (readings.length === 0) return res.json(null);
  res.json(readings[readings.length - 1]);
});

app.get('/api/clear', (_req, res) => {
  readings = [];
  saveReadings();
  res.json({ ok: true });
});

// ── Inicia servidor ──────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const ifaces = require('os').networkInterfaces();
  const ips = Object.values(ifaces).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n=== GPRS Dashboard ===`);
  console.log(`  Local:  http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Rede:   http://${ip}:${PORT}`));
  console.log(`\n  Endpoint ESP32: http://<seu-ip>:${PORT}/data?temp=25&umid=60&...`);
  console.log('');
});
