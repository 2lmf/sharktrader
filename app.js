// --- SHARK TRADER SIMULATOR (v0.7 PRO) ---

const CONFIG = {
    UPDATE_INTERVAL: 5000,
    INITIAL_BALANCE: 1000,
    COINS: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'AVAXUSDT', 'FETUSDT']
};

const COIN_METADATA = {
    'BTCUSDT': { name: 'Bitcoin', icon: 'fab fa-bitcoin' },
    'ETHUSDT': { name: 'Ethereum', icon: 'fab fa-ethereum' },
    'SOLUSDT': { name: 'Solana', icon: 'fas fa-s' },
    'BNBUSDT': { name: 'Binance Coin', icon: 'fas fa-coins' },
    'XRPUSDT': { name: 'Ripple', icon: 'fas fa-x' },
    'ADAUSDT': { name: 'Cardano', icon: 'fas fa-dna' },
    'DOGEUSDT': { name: 'Dogecoin', icon: 'fas fa-dog' },
    'DOTUSDT': { name: 'Polkadot', icon: 'fas fa-circle-nodes' },
    'MATICUSDT': { name: 'Polygon', icon: 'fas fa-layer-group' },
    'LINKUSDT': { name: 'Chainlink', icon: 'fas fa-link' },
    'AVAXUSDT': { name: 'Avalanche', icon: 'fas fa-mountain' },
    'FETUSDT': { name: 'Fetch.ai', icon: 'fas fa-brain' }
};

const SHARK_AI = {
    BULL_WORDS: ['bull', 'buy', 'surge', 'pump', 'profit', 'high', 'moon', 'adopt', 'partnership'],
    BEAR_WORDS: ['bear', 'sell', 'crash', 'dump', 'hack', 'scam', 'drop', 'ban', 'fear', 'lawsuit'],
    STOP_LOSS: -10, // Max -10% drop
    TAKE_PROFIT: 15 // Sell at +15%
};

const savedWallet = localStorage.getItem('SHARK_WALLET');
const savedAutoTrade = localStorage.getItem('SHARK_AUTOTRADE') === 'true';
const savedLiveMode = localStorage.getItem('SHARK_LIVEMODE') === 'true';
let state = {
    balance: savedWallet !== null ? parseFloat(savedWallet) : CONFIG.INITIAL_BALANCE,
    holdings: JSON.parse(localStorage.getItem('SHARK_HOLDINGS')) || {},
    prices: {},
    autoTrade: savedAutoTrade,
    liveMode: savedLiveMode,
    bridgeConnected: false,
    news: [],
    sentiment: {}
};

let activeTrade = { symbol: null, type: null };

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🦈 Shark Trader Simulator Ready!");

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log("Shark PWA: Service Worker Registered"))
            .catch(err => console.error("Shark PWA: Registration Failed", err));
    }

    initTradeModal();
    initAutoTrade();
    initLiveMode();
    updateUI();
    renderPriceCards();
    fetchPrices();
    fetchNews();
    renderHoldings();

    // System checks
    setInterval(() => {
        fetchPrices();
        checkBridgeStatus();
        if (state.autoTrade) runAutoTradeAgent();
        updateUI();
        renderHoldings();
    }, CONFIG.UPDATE_INTERVAL);

    setInterval(fetchNews, 30000);
});

function initLiveMode() {
    const toggle = document.getElementById('liveModeToggle');
    if (toggle) {
        toggle.checked = state.liveMode;
        toggle.addEventListener('change', (e) => {
            if (e.target.checked && !state.bridgeConnected) {
                alert("Shark Bridge nije povezan! Pokreni 'node server.js' u bridge folderu.");
                e.target.checked = false;
                return;
            }
            state.liveMode = e.target.checked;
            localStorage.setItem('SHARK_LIVEMODE', state.liveMode);
            logAction(`TRADING MODE: ${state.liveMode ? 'LIVE (REAL MONEY)' : 'SIMULATION'}`, state.liveMode ? 'ERROR' : 'INFO');
        });
    }
}

async function checkBridgeStatus() {
    try {
        const res = await fetch('http://localhost:3000/api/account');
        state.bridgeConnected = res.ok;
        if (state.liveMode && res.ok) {
            const data = await res.json();
            // Sync real balance (find USDT)
            const usdt = data.balances.find(b => b.asset === 'USDT');
            if (usdt) state.balance = parseFloat(usdt.free);
        }
    } catch (e) {
        state.bridgeConnected = false;
        if (state.liveMode) {
            state.liveMode = false;
            document.getElementById('liveModeToggle').checked = false;
            logAction("VEZA S BRIDGE-OM IZGUBLJENA. LIVE MODE ugašen.", "ERROR");
        }
    }
    updateBridgeUI();
}

function updateBridgeUI() {
    const el = document.getElementById('bridgeStatus');
    if (!el) return;
    const msg = el.querySelector('.status-msg');

    if (state.bridgeConnected) {
        el.className = 'bridge-status connected';
        msg.innerText = 'CONNECTED';
    } else {
        el.className = 'bridge-status';
        msg.innerText = 'DISCONNECTED';
    }
}

function initAutoTrade() {
    const toggle = document.getElementById('autoTradeToggle');
    if (toggle) {
        toggle.checked = state.autoTrade;
        toggle.addEventListener('change', (e) => {
            state.autoTrade = e.target.checked;
            localStorage.setItem('SHARK_AUTOTRADE', state.autoTrade);
            logAction(`AI Auto-Trade: ${state.autoTrade ? 'AKTIVIRAN' : 'DEAKTIVIRAN'}`, "INFO");
        });
    }
}

function initTradeModal() {
    const btnExecute = document.getElementById('btnExecuteTrade');
    if (btnExecute) {
        btnExecute.addEventListener('click', executeTrade);
    }
}

function openTradeModal(symbol, type) {
    const modal = document.getElementById('tradeModal');
    const title = document.getElementById('modalTitle');
    activeTrade = { symbol, type };

    title.innerText = `${type.toUpperCase()} ${symbol.replace('USDT', '')}`;
    modal.classList.add('active');
    document.getElementById('tradeAmount').value = '';
    document.getElementById('tradeAmount').focus();
}

function closeModal() {
    document.getElementById('tradeModal').classList.remove('active');
}

async function executeTrade() {
    const amountUSDT = parseFloat(document.getElementById('tradeAmount').value);
    if (!amountUSDT || amountUSDT <= 0) return alert("Unesite ispravan iznos.");

    const price = state.prices[activeTrade.symbol]?.price;
    if (!price) return alert("Cijena nije dostupna.");

    if (state.liveMode) {
        // LIVE TRADING EXECUTION
        try {
            const res = await fetch('http://localhost:3000/api/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: activeTrade.symbol,
                    side: activeTrade.type,
                    quoteOrderQty: amountUSDT.toFixed(2)
                })
            });
            const data = await res.json();
            if (data.orderId) {
                logAction(`LIVE MANUAL TRADED: ${activeTrade.type.toUpperCase()} ${activeTrade.symbol}`, "BUY");
                closeModal();
            } else {
                alert("Greška kod izvršenja: " + (data.error?.msg || "Nepoznata greška"));
            }
        } catch (e) {
            alert("Veza s Bridge serverom nije uspjela!");
        }
    } else {
        // SIMULATION LOGIC
        if (activeTrade.type === 'buy') {
            if (amountUSDT > state.balance) return alert("Nedovoljno USDT balansa.");
            state.balance -= amountUSDT;
            const coinAmount = amountUSDT / price;
            state.holdings[activeTrade.symbol] = (state.holdings[activeTrade.symbol] || 0) + coinAmount;
            logAction(`Kupljeno ${coinAmount.toFixed(4)} ${activeTrade.symbol.replace('USDT', '')} po cijeni ${formatCurrency(price)}`, "BUY");
        } else {
            const currentHolding = state.holdings[activeTrade.symbol] || 0;
            const coinToSell = amountUSDT / price;
            if (coinToSell > currentHolding) return alert("Nemate dovoljno kovanica za prodaju.");
            state.balance += amountUSDT;
            state.holdings[activeTrade.symbol] -= coinToSell;
            logAction(`Prodano ${coinToSell.toFixed(4)} ${activeTrade.symbol.replace('USDT', '')} po cijeni ${formatCurrency(price)}`, "SELL");
        }
        saveState();
        updateUI();
        renderHoldings();
        closeModal();
    }
}

function saveState() {
    localStorage.setItem('SHARK_WALLET', state.balance);
    localStorage.setItem('SHARK_HOLDINGS', JSON.stringify(state.holdings));
}

async function fetchPrices() {
    try {
        // Binance Public Ticker API (CORS friendly for public endpoints)
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await response.json();

        // Filter requested coins
        const filtered = data.filter(c => CONFIG.COINS.includes(c.symbol));

        filtered.forEach(coin => {
            state.prices[coin.symbol] = {
                price: parseFloat(coin.lastPrice),
                change: parseFloat(coin.priceChangePercent)
            };
        });

        updatePriceCards();
        analyzeMarket();
        updateUI(); // Osvježi Net Worth (Ukupnu vrijednost)
    } catch (err) {
        console.error("Shark: Greška pri dohvaćanju cijena", err);
    }
}

function renderPriceCards() {
    const container = document.getElementById('priceCards');
    if (!container) return;
    container.innerHTML = ''; // Očisti loader

    CONFIG.COINS.forEach(symbol => {
        const meta = COIN_METADATA[symbol] || { name: symbol, icon: 'fas fa-coins' };
        const card = document.createElement('div');
        const coinPrefix = symbol.replace('USDT', '').toLowerCase();
        card.className = 'price-card glass';
        card.id = `card-${symbol}`;
        card.innerHTML = `
            <div class="coin-info">
                <i class="${meta.icon}"></i>
                <div>
                    <div class="symbol">${symbol.replace('USDT', '')}/USDT</div>
                    <div class="name">${meta.name}</div>
                </div>
            </div>
            <div class="coin-price-container">
                <div class="coin-price" id="${coinPrefix}Price">--.--- $</div>
                <div class="coin-change" id="${coinPrefix}Change">+0.00%</div>
                <div class="coin-sentiment" id="${coinPrefix}Sentiment">Sentiment: --%</div>
            </div>
            <div class="trade-actions">
                <button class="btn-trade buy" onclick="openTradeModal('${symbol}', 'buy')">BUY</button>
                <button class="btn-trade sell" onclick="openTradeModal('${symbol}', 'sell')">SELL</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function calculateCoinSentiment(symbol) {
    let score = 50; // Neutral starting
    const search = symbol.replace('USDT', '').toLowerCase();

    state.news.forEach(item => {
        const text = (item.title + item.body).toLowerCase();
        if (text.includes(search)) {
            SHARK_AI.BULL_WORDS.forEach(w => { if (text.includes(w)) score += 5; });
            SHARK_AI.BEAR_WORDS.forEach(w => { if (text.includes(w)) score -= 8; });
        }
    });

    return Math.min(100, Math.max(0, score));
}

function updatePriceCards() {
    CONFIG.COINS.forEach(symbol => {
        const coinPrefix = symbol.replace('USDT', '').toLowerCase();
        const priceEl = document.getElementById(`${coinPrefix}Price`);
        const changeEl = document.getElementById(`${coinPrefix}Change`);
        const sentEl = document.getElementById(`${coinPrefix}Sentiment`);

        const coinData = state.prices[symbol];
        if (coinData && priceEl && changeEl) {
            priceEl.innerText = formatCurrency(coinData.price);
            changeEl.innerText = `${coinData.change > 0 ? '+' : ''}${coinData.change.toFixed(2)}%`;
            changeEl.className = `coin-change ${coinData.change >= 0 ? 'success' : 'error'}`;

            // Pro Sentiment logic
            const sentiment = calculateCoinSentiment(symbol);
            state.sentiment[symbol] = sentiment;

            if (sentEl) {
                sentEl.innerText = `Sentiment: ${sentiment}%`;
                sentEl.style.color = sentiment > 60 ? 'var(--success)' : (sentiment < 40 ? 'var(--error)' : 'var(--text-muted)');
            }

            const cardEl = document.getElementById(`card-${symbol}`);
            if (cardEl) {
                cardEl.style.borderRight = `4px solid ${sentiment > 60 ? 'var(--success)' : (sentiment < 40 ? 'var(--error)' : 'var(--glass-border)')}`;
            }
        }
    });
}

// --- AI BRAIN (AUTO-TRADE) ---
let lastTradeTime = 0;
function runAutoTradeAgent() {
    const now = Date.now();
    if (now - lastTradeTime < 10000) return; // limit trade rate

    CONFIG.COINS.forEach(symbol => {
        const coin = state.prices[symbol];
        if (!coin) return;

        // STRATEGY (v0.6): Buy the Dip (-1.5%) + Good Sentiment (>45)
        const sentiment = state.sentiment[symbol] || 50;
        if (coin.change < -1.5 && sentiment >= 45 && state.balance >= 100) {
            const currentHolding = state.holdings[symbol] || 0;
            if (currentHolding < 0.0001) { // Buy if not holding
                autoExecuteTrade(symbol, 'buy', 100);
                lastTradeTime = now;
            }
        }

        // AUTO-SELL LOGIC (PRO)
        const currentHolding = state.holdings[symbol] || 0;
        if (currentHolding > 0) {
            // Take Profit (+15%)
            if (coin.change > SHARK_AI.TAKE_PROFIT) {
                autoExecuteTrade(symbol, 'sell', currentHolding * coin.price, "PROFIT");
                lastTradeTime = now;
            }
            // Stop Loss (-10%)
            else if (coin.change < SHARK_AI.STOP_LOSS) {
                autoExecuteTrade(symbol, 'sell', currentHolding * coin.price, "STOP LOSS");
                lastTradeTime = now;
            }
        }
    });
}

async function autoExecuteTrade(symbol, type, amountUSDT, reason = "") {
    if (state.liveMode) {
        try {
            const res = await fetch('http://localhost:3000/api/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: symbol,
                    side: type,
                    quoteOrderQty: amountUSDT.toFixed(2)
                })
            });
            const data = await res.json();
            if (data.orderId) {
                logAction(`LIVE REAL TRADED: ${type.toUpperCase()} ${symbol}`, "BUY");
            } else {
                logAction(`LIVE ORDER FAILED: ${JSON.stringify(data.error)}`, "ERROR");
            }
        } catch (e) {
            logAction(`LIVE BRIDGE ERROR: ${e.message}`, "ERROR");
        }
    } else {
        const price = state.prices[symbol].price;
        if (type === 'buy') {
            state.balance -= amountUSDT;
            const coinAmount = amountUSDT / price;
            state.holdings[symbol] = (state.holdings[symbol] || 0) + coinAmount;
            logAction(`AI: AUTOMATSKA KUPNJA ${coinAmount.toFixed(4)} ${symbol.replace('USDT', '')}`, "BUY");
        } else {
            state.balance += amountUSDT;
            state.holdings[symbol] = 0;
            logAction(`AI: AUTOMATSKA PRODAJA ${reason ? '(' + reason + ')' : ''} ${symbol.replace('USDT', '')}`, "SELL");
        }
        saveState();
        updateUI();
        renderHoldings();
    }
}

// --- NEWS ENGINE ---
async function fetchNews() {
    try {
        const response = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
        const data = await response.json();
        state.news = data.Data;
        renderNews(data.Data.slice(0, 6));
    } catch (err) {
        console.error("Shark: Greška pri dohvaćanju vijesti", err);
    }
}

function renderNews(news) {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    news.forEach(item => {
        const card = document.createElement('div');
        card.className = 'news-card glass';
        card.innerHTML = `
            <img src="${item.imageurl}" alt="news">
            <div class="news-content">
                <span class="source">${item.source}</span>
                <h4>${item.title}</h4>
            </div>
        `;
        card.onclick = () => window.open(item.url, '_blank');
        grid.appendChild(card);
    });
}

function analyzeMarket() {
    const pulseValue = document.getElementById('marketSentiment');
    const btc = state.prices['BTCUSDT'];

    if (!btc || !pulseValue) return;

    if (btc.change > 2) {
        pulseValue.innerText = "STRONG BULL";
        pulseValue.style.color = "var(--success)";
    } else if (btc.change > 0) {
        pulseValue.innerText = "BULLISH";
        pulseValue.style.color = "var(--accent)";
    } else if (btc.change < -2) {
        pulseValue.innerText = "BEARISH";
        pulseValue.style.color = "var(--error)";
    } else {
        pulseValue.innerText = "NEUTRAL";
        pulseValue.style.color = "var(--text-muted)";
    }
}

function renderHoldings() {
    const grid = document.getElementById('holdingsGrid');
    if (!grid) return;

    const symbols = Object.keys(state.holdings).filter(s => state.holdings[s] > 0.000001);

    if (symbols.length === 0) {
        grid.innerHTML = '<div class="empty-holdings">Vaš portfelj je prazan.</div>';
        return;
    }

    grid.innerHTML = '';
    symbols.forEach(symbol => {
        const amount = state.holdings[symbol];
        const currentPrice = state.prices[symbol]?.price || 0;
        const totalValue = amount * currentPrice;

        const card = document.createElement('div');
        card.className = 'holding-card glass';
        card.innerHTML = `
            <div class="holding-info">
                <div class="symbol">${symbol.replace('USDT', '')}</div>
                <div class="amount">${amount.toFixed(4)}</div>
            </div>
            <div class="holding-value">
                <span class="val">${totalValue.toLocaleString('hr-HR', { minimumFractionDigits: 2 })} USDT</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function updateUI() {
    const balanceEl = document.getElementById('totalBalance');
    if (!balanceEl) return;

    // Calculate Net Worth: USDT Balance + Value of all Holdings
    let totalValue = state.balance;
    Object.keys(state.holdings).forEach(symbol => {
        const amount = state.holdings[symbol];
        const price = state.prices[symbol]?.price || 0;
        totalValue += amount * price;
    });

    balanceEl.innerText = totalValue.toLocaleString('hr-HR', { minimumFractionDigits: 2 }) + ' USDT';
}

function formatCurrency(val) {
    return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function logAction(msg, type = "INFO") {
    const log = document.getElementById('botLog');
    if (!log) return;
    const item = document.createElement('div');
    item.className = 'log-item';
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    item.innerHTML = `
        <span class="time">${time}</span>
        <span class="type ${type.toLowerCase()}">${type}</span>
        <span class="msg">${msg}</span>
    `;

    log.prepend(item);
}
