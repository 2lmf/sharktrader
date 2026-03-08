// --- SHARK TRADER SIMULATOR (v0.1) ---

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

const savedWallet = localStorage.getItem('SHARK_WALLET');
let state = {
    balance: savedWallet !== null ? parseFloat(savedWallet) : CONFIG.INITIAL_BALANCE,
    holdings: JSON.parse(localStorage.getItem('SHARK_HOLDINGS')) || {},
    prices: {},
    autoTrade: false
};

let activeTrade = { symbol: null, type: null };

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🦈 Shark Trader Simulator Ready!");
    initTradeModal();
    initAutoTrade();
    updateUI();
    renderPriceCards();
    fetchPrices();
    fetchNews();
    renderHoldings();

    // Auto-update feed
    setInterval(() => {
        fetchPrices();
        if (state.autoTrade) runAutoTradeAgent();
        renderHoldings();
    }, CONFIG.UPDATE_INTERVAL);

    // Refresh news every 30s
    setInterval(fetchNews, 30000);
});

function initAutoTrade() {
    const toggle = document.getElementById('autoTradeToggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            state.autoTrade = e.target.checked;
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

function executeTrade() {
    const amountUSDT = parseFloat(document.getElementById('tradeAmount').value);
    if (!amountUSDT || amountUSDT <= 0) return alert("Unesite ispravan iznos.");

    const price = state.prices[activeTrade.symbol]?.price;
    if (!price) return alert("Cijena nije dostupna.");

    if (activeTrade.type === 'buy') {
        if (amountUSDT > state.balance) return alert("Nedovoljno USDT balansa.");

        state.balance -= amountUSDT;
        const coinAmount = amountUSDT / price;

        state.holdings[activeTrade.symbol] = (state.holdings[activeTrade.symbol] || 0) + coinAmount;
        logAction(`Kupljeno ${coinAmount.toFixed(4)} ${activeTrade.symbol.replace('USDT', '')} po cijeni ${formatCurrency(price)}`, "BUY");
    } else {
        // SELL
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
            </div>
            <div class="trade-actions">
                <button class="btn-trade buy" onclick="openTradeModal('${symbol}', 'buy')">BUY</button>
                <button class="btn-trade sell" onclick="openTradeModal('${symbol}', 'sell')">SELL</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function updatePriceCards() {
    CONFIG.COINS.forEach(symbol => {
        const coinPrefix = symbol.replace('USDT', '').toLowerCase();
        const priceEl = document.getElementById(`${coinPrefix}Price`);
        const changeEl = document.getElementById(`${coinPrefix}Change`);

        const coinData = state.prices[symbol];
        if (coinData && priceEl && changeEl) {
            priceEl.innerText = formatCurrency(coinData.price);
            changeEl.innerText = `${coinData.change > 0 ? '+' : ''}${coinData.change.toFixed(2)}%`;
            changeEl.className = `coin-change ${coinData.change >= 0 ? 'success' : 'error'}`;
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

        // STRATEGY: Buy the Dip (-4%)
        if (coin.change < -4 && state.balance >= 100) {
            const currentHolding = state.holdings[symbol] || 0;
            if (currentHolding === 0) { // Only buy if we don't hold already (simple bot)
                autoExecuteTrade(symbol, 'buy', 100);
                lastTradeTime = now;
            }
        }

        // STRATEGY: Sell for Profit (+3%)
        const currentHolding = state.holdings[symbol] || 0;
        if (currentHolding > 0 && coin.change > 3) {
            const valueInUSDT = currentHolding * coin.price;
            autoExecuteTrade(symbol, 'sell', valueInUSDT);
            lastTradeTime = now;
        }
    });
}

function autoExecuteTrade(symbol, type, amountUSDT) {
    const price = state.prices[symbol].price;
    if (type === 'buy') {
        state.balance -= amountUSDT;
        const coinAmount = amountUSDT / price;
        state.holdings[symbol] = (state.holdings[symbol] || 0) + coinAmount;
        logAction(`AI: AUTOMATSKA KUPNJA ${coinAmount.toFixed(4)} ${symbol.replace('USDT', '')}`, "BUY");
    } else {
        state.balance += amountUSDT;
        state.holdings[symbol] = 0; // Sell all for profit
        logAction(`AI: AUTOMATSKA PRODAJA (PROFIT) ${symbol.replace('USDT', '')}`, "SELL");
    }
    saveState();
    updateUI();
    renderHoldings();
}

// --- NEWS ENGINE ---
async function fetchNews() {
    try {
        const response = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
        const data = await response.json();
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
    if (balanceEl) {
        balanceEl.innerText = state.balance.toLocaleString('hr-HR', { minimumFractionDigits: 2 }) + ' USDT';
    }
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
