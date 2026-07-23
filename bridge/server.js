require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const SocksProxyAgent = require('socks-proxy-agent');

const PROXY_URL = process.env.PROXY_URL || 'socks5h://127.0.0.1:1080';
const USE_PROXY = process.env.USE_PROXY === 'true';
const httpsAgent = USE_PROXY ? new SocksProxyAgent(PROXY_URL) : null;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const OKX_API_URL = 'https://my.okx.com';

const okxClient = axios.create({
    baseURL: OKX_API_URL,
    httpsAgent: httpsAgent,
    httpAgent: httpsAgent
});

let timeOffset = 0;

async function syncTime() {
    try {
        const response = await okxClient.get('/api/v5/public/time');
        const serverTime = parseInt(response.data.data[0].ts);
        timeOffset = serverTime - Date.now();
        console.log(`⏱️ Vrijeme sinkronizirano s OKX-om! Offset: ${timeOffset}ms`);
    } catch (err) {
        console.error("❌ Greška pri sinkronizaciji vremena:", err.message);
    }
}
syncTime();
setInterval(syncTime, 1000 * 60 * 10);

function generateOKXSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method.toUpperCase() + requestPath + body;
    return crypto
        .createHmac('sha256', process.env.OKX_SECRET_KEY)
        .update(message)
        .digest('base64');
}

function getOKXHeaders(method, requestPath, body = '') {
    const timestamp = new Date(Date.now() + timeOffset).toISOString();
    return {
        'OK-ACCESS-KEY': process.env.OKX_API_KEY,
        'OK-ACCESS-SIGN': generateOKXSignature(timestamp, method, requestPath, body),
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE,
        'Content-Type': 'application/json'
    };
}

// Konverzija simbola: BTCUSDC → BTC-USDC
function toOKX(symbol) {
    return symbol.replace('USDC', '-USDC');
}

// --- ENDPOINT: Get Real Balance ---
app.get('/api/account', async (req, res) => {
    try {
        const path = '/api/v5/account/balance';
        const response = await okxClient.get(path, {
            headers: getOKXHeaders('GET', path)
        });

        if (response.data.code !== '0') {
            return res.status(500).json({ error: response.data.msg });
        }

        // Pretvori OKX format u Binance-kompatibilan format koji frontend očekuje
        const details = response.data.data?.[0]?.details || [];
        const balances = details.map(d => ({
            asset: d.ccy,
            free: d.availBal,
            locked: d.frozenBal
        }));

        res.json({ balances });
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ OKX Account Greška:", errorData);
        res.status(500).json({ error: errorData });
    }
});

// --- ENDPOINT: Execute Real Order ---
app.post('/api/order', async (req, res) => {
    const { symbol, side, quoteOrderQty } = req.body;
    const instId = toOKX(symbol);

    try {
        let orderBody;

        if (side.toUpperCase() === 'SELL') {
            // SELL: OKX treba količinu coina (base currency)
            const pricePath = `/api/v5/market/ticker?instId=${instId}`;
            const priceRes = await okxClient.get(pricePath);
            const currentPrice = parseFloat(priceRes.data.data[0].last);

            let rawCoinQty = quoteOrderQty / currentPrice;
            let coinQty;

            // Dohvati lotSz za OKX instrument
            let lotSz = null;
            try {
                const instrPath = `/api/v5/public/instruments?instType=SPOT&instId=${instId}`;
                const instrRes = await okxClient.get(instrPath);
                lotSz = instrRes.data.data?.[0]?.lotSz;
            } catch (instrErr) {
                console.error(`⚠️ Neuspješno dohvaćanje instruments za ${instId}:`, instrErr.message);
            }

            if (lotSz) {
                const step = parseFloat(lotSz);
                if (step > 0) {
                    let precision = 0;
                    const parts = lotSz.split('.');
                    if (parts.length === 2) {
                        const frac = parts[1].replace(/0+$/, '');
                        precision = frac.length;
                    }
                    const factor = Math.pow(10, precision);
                    coinQty = (Math.floor(rawCoinQty * factor) / factor).toFixed(precision);
                    console.log(`🎯 Prilagođeno prema lotSz (${lotSz}): ${coinQty}`);
                } else {
                    coinQty = parseFloat(rawCoinQty.toFixed(6)).toString();
                }
            } else {
                coinQty = parseFloat(rawCoinQty.toFixed(6)).toString();
            }

            console.log(`🚀 SELL ${instId}: ${quoteOrderQty} USDC ÷ ${currentPrice} = ${coinQty} kom`);
            orderBody = { instId, tdMode: 'cash', side: 'sell', ordType: 'market', sz: coinQty };

        } else {
            // BUY: OKX prima USDC iznos direktno uz tgtCcy: 'quote_ccy'
            // Provjeri minimum za ovaj par (minSz je u base valuti, pretvaramo u USDC)
            try {
                const instrPath = `/api/v5/public/instruments?instType=SPOT&instId=${instId}`;
                const instrRes = await okxClient.get(instrPath);
                const instr = instrRes.data.data?.[0];
                if (instr?.minSz) {
                    const pricePath = `/api/v5/market/ticker?instId=${instId}`;
                    const priceRes = await okxClient.get(pricePath);
                    const currentPrice = parseFloat(priceRes.data.data[0].last);
                    const minUsdc = Math.ceil(parseFloat(instr.minSz) * currentPrice * 100) / 100;
                    if (quoteOrderQty < minUsdc) {
                        return res.status(400).json({ error: { code: '51020', msg: `Minimum za ${instId} je ${minUsdc.toFixed(2)} USDC` } });
                    }
                }
            } catch (minErr) {
                console.warn(`⚠️ Nije moguće dohvatiti minimum za ${instId}:`, minErr.message);
            }
            const safeQty = parseFloat(Number(quoteOrderQty).toFixed(4)).toString();
            console.log(`🚀 BUY ${instId} iznos: ${safeQty} USDC`);
            orderBody = { instId, tdMode: 'cash', side: 'buy', ordType: 'market', sz: safeQty, tgtCcy: 'quote_ccy' };
        }

        const bodyStr = JSON.stringify(orderBody);
        const path = '/api/v5/trade/order';
        console.log(`🔗 OKX Order body: ${bodyStr}`);

        const response = await okxClient.post(path, orderBody, {
            headers: getOKXHeaders('POST', path, bodyStr)
        });

        const topCode = response.data.code;
        const firstResult = response.data.data?.[0];
        const sCode = firstResult?.sCode;

        if (topCode !== '0' || (sCode && sCode !== '0')) {
            const errMsg = firstResult?.sMsg || response.data.msg || 'OKX greška';
            const errCode = sCode || topCode;
            console.error(`❌ OKX Order Greška [${errCode}]: ${errMsg}`, response.data);
            return res.status(500).json({ error: { code: errCode, msg: errMsg, raw: response.data } });
        }

        res.json(response.data);
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ OKX Order Greška:", errorData);
        res.status(500).json({ error: errorData });
    }
});

// --- ENDPOINT: Get Prices (proxy za SIM mode i CORS) ---
app.get('/api/prices', async (req, res) => {
    try {
        // Dohvati sve SPOT tickere s OKX-a (javni endpoint, nema autentikacije)
        const response = await okxClient.get('/api/v5/market/tickers?instType=SPOT');

        if (response.data.code !== '0') {
            return res.status(500).json({ error: response.data.msg });
        }

        // Parsiraj tražene simbole iz requesta (Binance format: ["BTCUSDC", ...])
        let wantedSet = null;
        if (req.query.symbols) {
            try {
                const arr = JSON.parse(req.query.symbols);
                wantedSet = new Set(arr);
            } catch (_) {}
        }

        // Pretvori OKX format u Binance-kompatibilan format koji frontend očekuje
        const tickers = response.data.data
            .filter(t => {
                const binanceSymbol = t.instId.replace('-', '');
                return wantedSet ? wantedSet.has(binanceSymbol) : true;
            })
            .map(t => {
                const last = parseFloat(t.last);
                const open24h = parseFloat(t.open24h);
                const changePercent = open24h > 0
                    ? ((last - open24h) / open24h * 100).toFixed(2)
                    : '0.00';
                return {
                    symbol: t.instId.replace('-', ''),
                    lastPrice: t.last,
                    priceChangePercent: changePercent,
                    volume: t.vol24h,
                    quoteVolume: t.volCcy24h,
                    highPrice: t.high24h,
                    lowPrice: t.low24h
                };
            });

        res.json(tickers);
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ OKX Prices Greška:", errorData);
        res.status(500).json({ error: errorData });
    }
});

// --- ENDPOINT: Market Wisdom (Fear & Greed + mocked Whale/GitHub) ---
app.get('/api/market-wisdom', async (req, res) => {
    try {
        const fngRes = await axios.get('https://api.alternative.me/fng/?format=json');
        const fngData = fngRes.data.data[0];

        const wisdom = {
            fng: {
                value: parseInt(fngData.value),
                classification: fngData.value_classification,
                timestamp: fngData.timestamp
            },
            whales: [
                { type: 'OUTFLOW', amount: '450 BTC', from: 'OKX', to: 'Unknown Wallet', time: '5m ago' },
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

// --- ENDPOINT: Shark Analyst AI Chat (Groq) ---
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
- Uvijek pogledaj portfelj i komentiraj pozicije — što je u plusu, što kasni, što ima potencijala
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
    console.log(`OKX API spojen. Ovaj prozor mora ostati otvoren za LIVE trgovanje.`);
});
