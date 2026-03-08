require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const BINANCE_API_URL = 'https://api.binance.com';

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

        const response = await axios.get(`${BINANCE_API_URL}/api/v3/account?${queryString}&signature=${signature}`, {
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
    const { symbol, side, quoteOrderQty } = req.body; // quoteOrderQty uses USDT amount

    try {
        const timestamp = Date.now();
        const queryString = `symbol=${symbol}&side=${side.toUpperCase()}&type=MARKET&quoteOrderQty=${quoteOrderQty}&timestamp=${timestamp}`;
        const signature = generateSignature(queryString);

        const response = await axios.post(`${BINANCE_API_URL}/api/v3/order?${queryString}&signature=${signature}`, null, {
            headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }
        });

        res.json(response.data);
    } catch (err) {
        console.error("❌ Binance Order Greška:", err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🦈 Shark Bridge AKTIVAN na http://localhost:${PORT}`);
    console.log(`Ovaj prozor mora ostati otvoren za LIVE trgovanje.`);
});
