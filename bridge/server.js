require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const SocksProxyAgent = require('socks-proxy-agent');

// Konfiguracija za Proxy (Shadow Bridge)
const PROXY_URL = process.env.PROXY_URL || 'socks5h://127.0.0.1:1080';
const USE_PROXY = process.env.USE_PROXY === 'true';

const httpsAgent = USE_PROXY ? new SocksProxyAgent(PROXY_URL) : null;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const BINANCE_API_URL = 'https://api.binance.com';

const binanceClient = axios.create({
    baseURL: BINANCE_API_URL,
    httpsAgent: httpsAgent,
    httpAgent: httpsAgent
});

// --- MIDDLEWARE: Signature Generator for Binance ---
function generateSignature(queryString) {
    return crypto
        .createHmac('sha256', process.env.BINANCE_SECRET_KEY)
        .update(queryString)
        .digest('hex');
}

// --- ENDPOINT: Get Real Balance ---
app.get('/api/account', async (req, res) => {
    try {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = generateSignature(queryString);

        const response = await binanceClient.get(`/api/v3/account?${queryString}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }
        });

        res.json(response.data);
    } catch (err) {
        console.error("❌ Binance API Greška:", err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

// --- ENDPOINT: Execute Real Order ---
app.post('/api/order', async (req, res) => {
    const { symbol, side, quoteOrderQty } = req.body;

    try {
        const timestamp = Date.now();
        // Za BUY koristimo quoteOrderQty (iznos u USDC), za SELL bismo trebali quantity (količinu kovanice)
        // Ali bot trenutno šalje quoteOrderQty za oboje. Popravit ćemo to ako treba.
        // Osiguravamo maksimalno 4 decimale za USDC kako bismo izbjegli precision grešku s Binance API-jem.
        const safeQty = parseFloat(Number(quoteOrderQty).toFixed(4));
        const queryString = `symbol=${symbol}&side=${side.toUpperCase()}&type=MARKET&quoteOrderQty=${safeQty}&timestamp=${timestamp}`;
        const signature = generateSignature(queryString);

        console.log(`🚀 Šaljem nalog: ${side} ${symbol} iznos: ${safeQty} USDC`);
        console.log(`🔗 Query: ${queryString}`);

        const response = await binanceClient.post(`/api/v3/order?${queryString}&signature=${signature}`, null, {
            headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }
        });

        res.json(response.data);
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ Binance Order Greška:", errorData);
        res.status(500).json({ error: errorData });
    }
});

// --- ENDPOINT: Get Prices (Proxy to avoid CORS/IP blocks) ---
app.get('/api/prices', async (req, res) => {
    try {
        const { symbols } = req.query;
        // Let axios handle the encoding and params construction
        const response = await binanceClient.get('/api/v3/ticker/24hr', {
            params: symbols ? { symbols: symbols } : {}
        });
        res.json(response.data);
    } catch (err) {
        console.error("❌ Price Fetch Error:", err.response?.data || err.message);
        res.status(500).json({ error: "Could not fetch prices" });
    }
});

// --- ENDPOINT: Market Wisdom (v0.25 Hyperdrive) ---
app.get('/api/market-wisdom', async (req, res) => {
    try {
        // 1. Fear & Greed Index
        const fngRes = await axios.get('https://api.alternative.me/fng/?format=json');
        const fngData = fngRes.data.data[0];

        // 2. Mocked Whale & GitHub (Za demo v0.25)
        // Ovdje bi išla prava integracija sa Whale-Alert.io API-jem
        const wisdom = {
            fng: {
                value: parseInt(fngData.value),
                classification: fngData.value_classification,
                timestamp: fngData.timestamp
            },
            whales: [
                { type: 'OUTFLOW', amount: '450 BTC', from: 'Binance', to: 'Unknown Wallet', time: '5m ago' },
                { type: 'INFLOW', amount: '1200 ETH', from: 'Unknown Wallet', to: 'Coinbase', time: '12m ago' }
            ],
            github: {
                bitcoin: { last_push: '2h ago', status: 'Active' },
                ethereum: { last_push: '1h ago', status: 'Active' },
                solana: { last_push: '15m ago', status: 'Active' }
            }
        };

        res.json(wisdom);
    } catch (err) {
        console.error("❌ Market Wisdom Greška:", err.message);
        res.status(500).json({ error: "Could not fetch market wisdom" });
    }
});

app.listen(PORT, () => {
    console.log(`🦈 Shark Bridge AKTIVAN na http://localhost:${PORT}`);
    console.log(`Ovaj prozor mora ostati otvoren za LIVE trgovanje.`);
});
