// --- SHARK TRADER SIMULATOR (v0.1) ---

const CONFIG = {
    UPDATE_INTERVAL: 5000,
    INITIAL_BALANCE: 1000,
    COINS: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
};

const savedWallet = localStorage.getItem('SHARK_WALLET');
let state = {
    balance: savedWallet !== null ? parseFloat(savedWallet) : CONFIG.INITIAL_BALANCE,
    holdings: JSON.parse(localStorage.getItem('SHARK_HOLDINGS')) || {},
    prices: {}
};

let activeTrade = { symbol: null, type: null };

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🦈 Shark Trader Simulator Ready!");
    initTradeModal();
    updateUI();
    fetchPrices();
    renderHoldings();

    // Auto-update feed
    setInterval(() => {
        fetchPrices();
        renderHoldings(); // Osvježi vrijednost portfelja
    }, CONFIG.UPDATE_INTERVAL);
});

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
