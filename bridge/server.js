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

let timeOffset = 0;

// Sinkronizacija vremena s Binance serverom u pozadini
async function syncTime() {
    try {
        const response = await binanceClient.get('/api/v3/time');
        const serverTime = response.data.serverTime;
        timeOffset = serverTime - Date.now();
        console.log(`⏱️ Vrijeme sinkronizirano s Binanceom! Offset: ${timeOffset}ms`);
    } catch (err) {
        console.error("❌ Greška pri sinkronizaciji vremena:", err.message);
    }
}
syncTime();
setInterval(syncTime, 1000 * 60 * 10); // Osvježi svakih 10 minuta

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
        const timestamp = Date.now() + timeOffset;
        const queryString = `recvWindow=60000&timestamp=${timestamp}`;
        const signature = generateSignature(queryString);

        const response = await binanceClient.get(`/api/v3/account?${queryString}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }
        });

        res.json(response.data);
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ Binance API Greška:", errorData);

        // Automatska re-sinkronizacija ako je problem s vremenom (-1021)
        if (errorData.code === -1021) {
            console.log("🔄 Otkriven problem s vremenom. Pokrećem prisilnu re-sinkronizaciju...");
            await syncTime();
        }

        res.status(500).json({ error: errorData });
    }
});

// --- ENDPOINT: Execute Real Order ---
app.post('/api/order', async (req, res) => {
    const { symbol, side, quoteOrderQty } = req.body;

    try {
        const timestamp = Date.now() + timeOffset;
        let queryString;

        if (side.toUpperCase() === 'SELL') {
            // Binance SELL zahtijeva quantity (količina coina), ne quoteOrderQty
            // Dohvati trenutnu cijenu i pretvori USDC iznos u količinu coina
            const priceRes = await binanceClient.get(`/api/v3/ticker/price?symbol=${symbol}`);
            const currentPrice = parseFloat(priceRes.data.price);
            const coinQty = parseFloat((quoteOrderQty / currentPrice).toFixed(6));
            console.log(`🚀 SELL ${symbol}: ${quoteOrderQty} USDC ÷ ${currentPrice} = ${coinQty} kom`);
            queryString = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${coinQty}&recvWindow=60000&timestamp=${timestamp}`;
        } else {
            // BUY: quoteOrderQty (koliko USDC trošimo)
            const safeQty = parseFloat(Number(quoteOrderQty).toFixed(4));
            console.log(`🚀 BUY ${symbol} iznos: ${safeQty} USDC`);
            queryString = `symbol=${symbol}&side=BUY&type=MARKET&quoteOrderQty=${safeQty}&recvWindow=60000&timestamp=${timestamp}`;
        }

        const signature = generateSignature(queryString);
        console.log(`🔗 Query: ${queryString}`);

        const response = await binanceClient.post(`/api/v3/order?${queryString}&signature=${signature}`, null, {
            headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }
        });

        res.json(response.data);
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ Binance Order Greška:", errorData);

        // Automatska re-sinkronizacija ako je problem s vremenom (-1021)
        if (errorData.code === -1021) {
            console.log("🔄 Otkriven problem s vremenom tijekom reda. Pokrećem re-sinkronizaciju...");
            await syncTime();
        }

        res.status(500).json({ error: errorData });
    }
});

// --- ENDPOINT: Get Prices (Proxy to avoid CORS/IP blocks) ---
app.get('/api/prices', async (req, res) => {
    try {
        const { symbols } = req.query;
        const config = { params: symbols ? { symbols: symbols } : {} };
        const response = await binanceClient.get('/api/v3/ticker/24hr', config);
        res.json(response.data);
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ Batch Price Fetch Error:", errorData);

        // EXTRA DEBUG: If it's an invalid symbol error, find which one!
        if (req.query.symbols && errorData.code === -1121) {
            console.log("🔍 Running elimination debug to find the culprit...");
            try {
                const coins = JSON.parse(req.query.symbols);
                for (const coin of coins) {
                    try {
                        await binanceClient.get('/api/v3/ticker/24hr', { params: { symbol: coin } });
                    } catch (e) {
                        console.error(`‼️ FOUND INVALID SYMBOL: ${coin}`);
                        console.error(`Reason: ${JSON.stringify(e.response?.data || e.message)}`);
                    }
                }
            } catch (parseErr) {
                console.error("Debug Parse Error:", parseErr.message);
            }
        }
        
        res.status(500).json({ error: errorData });
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

// --- ENDPOINT: Shark Analyst AI Chat (Gemini) ---
app.post('/api/chat', async (req, res) => {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: 'No message' });
    if (!process.env.GROQ_API_KEY) {
        return res.status(503).json({ error: 'GROQ_API_KEY nije postavljen u .env datoteci.' });
    }

    try {
        const holdingsStr = context?.holdings?.length > 0
            ? context.holdings.map(h =>
                `  ${h.symbol}: ${Number(h.qty).toFixed(4)} kom @ $${h.buyPrice} → $${h.currentPrice} (P&L: ${h.pnl})`
              ).join('\n')
            : '  Nema otvorenih pozicija';

        const pricesStr = (context?.topPrices || []).slice(0, 10)
            .map(p => `${p.symbol}=$${Number(p.price).toFixed(2)}`).join(' | ');

        const systemPrompt =
`Ti si Shark Trader AI — iskusan kripto analitičar koji razmišlja naglas i dijeli stvarne uvide.
Imaš pristup stvarnim podacima o korisnikovom portfoliu i tržištu.

SNAPSHOT PORTFOLIA (${context?.mode || 'SIM'} mode):
- Slobodni balans: $${context?.balance} USDC
- Pozicije:
${holdingsStr}
- Tržišni sentiment: ${context?.sentiment || 'N/A'}
- Fear & Greed: ${context?.fng ? context.fng.value + ' (' + context.fng.classification + ')' : 'N/A'}
- Trenutne cijene: ${pricesStr}

KAPITAL — VAŽNO PRAVILO:
- Korisnik NE ulaže novi novac. Sav kapital za kupnju mora doći od prodaje postojećih pozicija.
- Dakle: svaki prijedlog za BUY mora imati i prijedlog za SELL (što prodati da bi se financirao ulaz).
- Iznimka: ako je tržišna situacija IZVANREDNA (Fear & Greed ispod 15, ekstremni crash, jednom-u-godini prilika), možeš u odgovoru napomenuti da bi se možda isplatilo dodati svježi kapital — ali to mora biti jasno istaknuto kao IZNIMKA, ne pravilo.

STIL ODGOVORA:
- Daj 150-220 riječi po odgovoru — dovoljno za pravu analizu
- Analiziraj trendove: što se događa na tržištu danas, kakav je momentum, što Fear & Greed govori
- Poveži konkretne cijene iz snapshota s tržišnim kontekstom (korelacije, dominacija BTC-a, altcoin sezona itd.)
- Uvijek poglEdaj portfelj i komentiraj pozicije — što je u plusu, što kasni, što ima potencijala
- Razmišljaj u rotacijama: ako vidiš da neka pozicija slabi a druga jača, predloži swap (npr. "izađi iz DOGEa, uđi u ETH")
- Minimalni iznos trades je uvijek 5 USDC, nikad manje
- Nemoj biti suhoparan — budi kao iskusan trader koji objašnjava kolegi, ne kao robot koji čita podatke
- Odgovaraj na jeziku na kojem ti korisnik piše (HR ili EN)

FORMAT PRIJEDLOGA:
- Gotovo uvijek swap format: PRVO tag za izlaz, ODMAH zatim tag za ulaz:
  [PRIJEDLOG: SELL DOGEUSDC 30]
  [PRIJEDLOG: BUY BTCUSDC 30]
- Iznose u swap paru uskladi (ono što prodaš ≈ ono što kupiš)
- Samostalni BUY bez SELL-a koristiti SAMO ako korisnik ima dovoljno slobodnog USDC balansa
- Tagovi moraju biti na samom kraju odgovora, nakon analize`;

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            max_tokens: 450,
            temperature: 0.7,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const reply = response.data.choices[0].message.content;
        console.log(`🦈 Analyst chat: "${message.substring(0, 50)}..." → ${reply.length} chars`);
        res.json({ reply });
    } catch (err) {
        const errMsg = err.response?.data?.error?.message || err.message;
        console.error('❌ Shark Analyst Error:', errMsg);
        res.status(500).json({ error: errMsg });
    }
});

app.listen(PORT, () => {
    console.log(`🦈 Shark Bridge AKTIVAN na http://localhost:${PORT}`);
    console.log(`Ovaj prozor mora ostati otvoren za LIVE trgovanje.`);
});
