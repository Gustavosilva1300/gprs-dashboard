const express = require('express');
const https = require('https');
const app = express();

const PORT = process.env.PORT || 3000;

// O ID EXATO da sua máquina no Dweet.io
const DWEET_DEVICE = 'ESP32-GPRS-COLETA-7734';

// Variável que guarda a última leitura na memória do servidor
let ultimaLeitura = null;
let ultimoTimestamp = '';

// =====================================================================
// 1. MOTOR DE BUSCA (POLLING NO DWEET.IO)
// =====================================================================
function buscarNoDweet() {
    https.get(`https://dweet.io/get/latest/dweet/for/${DWEET_DEVICE}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.this === 'succeeded' && json.with && json.with.length > 0) {
                    const dweet = json.with[0];
                    
                    // Se o horário do pacote for novo, atualiza o sistema!
                    if (dweet.created !== ultimoTimestamp) {
                        ultimoTimestamp = dweet.created;
                        ultimaLeitura = dweet.content;
                        
                        // Formata a data para o horário do Brasil
                        const dataLocal = new Date(dweet.created).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                        ultimaLeitura.data_formatada = dataLocal;
                        
                        console.log(`[${dataLocal}] 📥 Novo dado da máquina recebido via Dweet!`);
                    }
                }
            } catch (e) {
                console.error('Erro ao interpretar pacote do Dweet:', e.message);
            }
        });
    }).on('error', (e) => {
        console.error('Erro de conexão com a nuvem Dweet:', e.message);
    });
}

// Inicia a busca imediatamente e depois repete a cada 10 segundos
buscarNoDweet();
setInterval(buscarNoDweet, 10000);

// =====================================================================
// 2. DASHBOARD WEB (A TELA QUE VOCÊ VÊ NO CELULAR/PC)
// =====================================================================
app.get('/', (req, res) => {
    // Se a máquina ainda não mandou nada, mostra tela de espera
    if (!ultimaLeitura) {
        return res.send(`
            <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
                <h1>📡 Conectando com a Máquina...</h1>
                <p>O servidor está escutando o Dweet.io.</p>
                <p style="color: gray;">Aguardando o próximo envio do GPRS...</p>
                <script>setTimeout(() => location.reload(), 5000);</script>
            </div>
        `);
    }

    // Se tem dados, desenha o painel!
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard GPRS</title>
        <meta http-equiv="refresh" content="10">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 20px; }
            .container { max-width: 900px; margin: auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            h1 { text-align: center; color: #2c3e50; margin-bottom: 5px; }
            .status { text-align: center; font-size: 14px; color: #7f8c8d; margin-bottom: 30px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 15px; }
            .card { background: #ecf0f1; padding: 15px; border-radius: 8px; text-align: center; border-left: 5px solid #3498db; }
            .card h3 { margin: 0 0 10px 0; font-size: 13px; color: #34495e; text-transform: uppercase; }
            .card p { margin: 0; font-size: 24px; font-weight: bold; color: #2980b9; }
            
            .coletando { border-left-color: #27ae60; background: #e8f8f5; }
            .parado { border-left-color: #e74c3c; background: #fdedec; }
            .sinal-bom { border-left-color: #8e44ad; background: #f4ecf7; }
            
            .map-btn { display: block; max-width: 300px; margin: 30px auto 10px auto; padding: 12px; background: #2c3e50; color: white; text-align: center; text-decoration: none; border-radius: 5px; font-weight: bold; }
            .map-btn:hover { background: #1a252f; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #aaa; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📊 Painel de Monitoramento</h1>
            <div class="status">Última atualização: <b>${ultimaLeitura.data_formatada}</b></div>
            
            <div class="grid">
                <div class="card ${ultimaLeitura.coletando == 1 ? 'coletando' : 'parado'}">
                    <h3>Status Coleta</h3>
                    <p>${ultimaLeitura.coletando == 1 ? 'ATIVA' : 'PARADA'}</p>
                </div>
                <div class="card sinal-bom">
                    <h3>Sinal GSM</h3>
                    <p>${ultimaLeitura.sinal}/31</p>
                </div>
                <div class="card">
                    <h3>Tensão</h3>
                    <p>${ultimaLeitura.volt} V</p>
                </div>
                <div class="card">
                    <h3>Motor PWM</h3>
                    <p>${ultimaLeitura.motor} %</p>
                </div>
                <div class="card">
                    <h3>Temperatura</h3>
                    <p>${ultimaLeitura.temp} °C</p>
                </div>
                <div class="card">
                    <h3>Umidade</h3>
                    <p>${ultimaLeitura.umid} %</p>
                </div>
                <div class="card">
                    <h3>Barômetro</h3>
                    <p>${ultimaLeitura.baro} hPa</p>
                </div>
                <div class="card">
                    <h3>Altitude</h3>
                    <p>${ultimaLeitura.alt} m</p>
                </div>
                <div class="card">
                    <h3>Pressão 1</h3>
                    <p>${ultimaLeitura.p1} kPa</p>
                </div>
                <div class="card">
                    <h3>Pressão 2</h3>
                    <p>${ultimaLeitura.p2} kPa</p>
                </div>
            </div>

            <a class="map-btn" href="https://maps.google.com/?q=%.6f,%.6f${ultimaLeitura.lat},${ultimaLeitura.lon}" target="_blank">
                📍 Abrir no Google Maps
            </a>

            <div class="footer">
                Operando via Render.com (ID: srv-d8erk899rddc73clbdug) + Dweet Relay
            </div>
        </div>
    </body>
    </html>
    `;

    res.send(html);
});

// =====================================================================
// INICIA O SERVIDOR
// =====================================================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}. Escutando Dweet.io...`);
});
