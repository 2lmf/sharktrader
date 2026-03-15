// --- SHARK TRADER SIMULATOR (v0.36 PRO+) ---

const CONFIG = {
    UPDATE_INTERVAL: 5000,
    INITIAL_BALANCE: 1000,
    BINANCE_FEE: 0.001, // 0.1% Standard Fee
    COINS: ['BTCUSDC', 'ETHUSDC', 'SOLUSDC', 'BNBUSDC', 'XRPUSDC', 'ADAUSDC', 'DOGEUSDC', 'DOTUSDC', 'POLUSDC', 'LINKUSDC', 'AVAXUSDC', 'FETUSDC', 'JUPUSDC', 'RENDERUSDC', 'PEPEUSDC', 'WIFUSDC', 'BONKUSDC', 'NEARUSDC', 'TAOUSDC', 'GRTUSDC', 'POPCATUSDC', 'FLOKIUSDC', 'UNIUSDC', 'ONDOUSDC']
};

const COIN_METADATA = {
    'BTCUSDC': { name: 'Bitcoin', icon: 'fab fa-bitcoin' },
    'ETHUSDC': { name: 'Ethereum', icon: 'fab fa-ethereum' },
    'SOLUSDC': { name: 'Solana', icon: 'fas fa-s' },
    'BNBUSDC': { name: 'Binance Coin', icon: 'fas fa-coins' },
    'XRPUSDC': { name: 'Ripple', icon: 'fas fa-x' },
    'ADAUSDC': { name: 'Cardano', icon: 'fas fa-dna' },
    'DOGEUSDC': { name: 'Dogecoin', icon: 'fas fa-dog' },
    'DOTUSDC': { name: 'Polkadot', icon: 'fas fa-circle-nodes' },
    'POLUSDC': { name: 'Polygon', icon: 'fas fa-layer-group' },
    'LINKUSDC': { name: 'Chainlink', icon: 'fas fa-link' },
    'AVAXUSDC': { name: 'Avalanche', icon: 'fas fa-mountain' },
    'FETUSDC': { name: 'Fetch.ai', icon: 'fas fa-brain' },
    'JUPUSDC': { name: 'Jupiter', icon: 'fas fa-ring' },
    'RENDERUSDC': { name: 'Render', icon: 'fas fa-cube' },
    'PEPEUSDC': { name: 'Pepe', icon: 'fas fa-frog' },
    'WIFUSDC': { name: 'dogwifhat', icon: 'fas fa-dog' },
    'BONKUSDC': { name: 'Bonk', icon: 'fas fa-fire' },
    'NEARUSDC': { name: 'Near Protocol', icon: 'fas fa-globe' },
    'TAOUSDC': { name: 'Bittensor', icon: 'fas fa-brain' },
    'GRTUSDC': { name: 'The Graph', icon: 'fas fa-search' },
    'POPCATUSDC': { name: 'Popcat', icon: 'fas fa-cat' },
    'FLOKIUSDC': { name: 'Floki', icon: 'fas fa-shield-dog' },
    'UNIUSDC': { name: 'Uniswap', icon: 'fas fa-horse-head' },
    'ONDOUSDC': { name: 'Ondo Finance', icon: 'fas fa-building-columns' }
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
    history: JSON.parse(localStorage.getItem('SHARK_HISTORY')) || [],
    prices: {},
    autoTrade: savedAutoTrade,
    tradingMode: localStorage.getItem('SHARK_TRADING_MODE') || 'balanced',
    liveMode: savedLiveMode,

    showNetProfit: localStorage.getItem('SHARK_NET_PROFIT') === 'true',
    bridgeUrl: localStorage.getItem('SHARK_BRIDGE_URL') || 'http://localhost:3000',
    bridgeConnected: false,
    initialBalanceLogged: false,
    news: [],
    sentiment: {},
    marketWisdom: null
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
    initNetPayout();
    initTradingMode();
    initSettings();
    updateUI();
    renderPriceCards();
    fetchPrices();
    fetchNews();
    renderHoldings();
    renderHistory();

    // Initial rapid data sync
    fetchPrices();
    fetchNews();
    checkBridgeStatus().then(() => {
        if (state.autoTrade) runAutoTradeAgent();
    });

    // System checks
    setInterval(() => {
        fetchPrices();
        checkBridgeStatus();
        fetchMarketWisdom();
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

            // Immediately sync and update
            checkBridgeStatus();
            updateUI();
            renderHoldings();
        });
    }
}

function initSettings() {
    const btn = document.getElementById('btnSettings');
    const modal = document.getElementById('settingsModal');
    const input = document.getElementById('bridgeUrlInput');
    const saveBtn = document.getElementById('btnSaveSettings');
    const closeBtn = document.getElementById('btnCloseSettings');

    if (!btn || !modal) {
        console.warn("Shark: Settings elements missing");
        return;
    }

    btn.onclick = (e) => {
        e.preventDefault();
        input.value = state.bridgeUrl;
        modal.classList.add('active');
    };

    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');

    if (saveBtn) {
        saveBtn.onclick = () => {
            state.bridgeUrl = input.value;
            localStorage.setItem('SHARK_BRIDGE_URL', state.bridgeUrl);
            modal.classList.remove('active');
            checkBridgeStatus();
            logAction(`Bridge URL promijenjen u: ${state.bridgeUrl}`, "INFO");
        };
    }
}

async function fetchMarketWisdom() {
    if (!state.bridgeConnected) return;
    try {
        const res = await fetch(`${state.bridgeUrl}/api/market-wisdom`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        if (res.ok) {
            state.marketWisdom = await res.json();
            renderMarketWisdom();
        }
    } catch (e) {
        console.error("Wisdom Fetch Error:", e);
    }
}

function renderMarketWisdom() {
    if (!state.marketWisdom) return;
    const { fng, whales, github } = state.marketWisdom;

    // 1. Fear & Greed
    const fngCard = document.getElementById('fngCard');
    if (fngCard) {
        fngCard.querySelector('.fng-value').innerText = fng.value;
        const label = fngCard.querySelector('.fng-label');
        label.innerText = fng.classification;
        label.style.color = fng.value > 70 ? 'var(--error)' : fng.value < 30 ? 'var(--success)' : 'var(--accent)';
    }

    // 2. Whales
    const whaleList = document.getElementById('whaleList');
    if (whaleList) {
        whaleList.innerHTML = whales.map(w => `
            <div class="whale-item">
                <span class="type ${w.type.toLowerCase()}">${w.type}</span>
                <span class="amount">${w.amount}</span>
                <span class="time">${w.time}</span>
            </div>
        `).join('');
    }

    // 3. GitHub (Builder Alpha)
    const githubStats = document.getElementById('githubStats');
    if (githubStats) {
        githubStats.innerHTML = `
            <div class="repo-stat"><span>BTC Core:</span> <span class="status">${github.bitcoin.status}</span></div>
            <div class="repo-stat"><span>ETH Go:</span> <span class="status">${github.ethereum.status}</span></div>
            <div class="repo-stat"><span>SOL Dev:</span> <span class="status">${github.solana.status}</span></div>
        `;
    }
}
async function checkBridgeStatus() {
    try {
        const res = await fetch(`${state.bridgeUrl}/api/account`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        state.bridgeConnected = res.ok;
        if (res.ok) {
            const data = await res.json();

            // MIRROR MODE: Sync total net worth from Binance
            let totalCash = 0;
            let realHoldings = {};
            
            data.balances.forEach(b => {
                const free = parseFloat(b.free);
                const locked = parseFloat(b.locked);
                const total = free + locked;
                
                if (total <= 0) return;

                // 1. Stablecoins -> Treat as Cash
                if (['USDC', 'USDT', 'BUSD', 'DAI'].includes(b.asset)) {
                    totalCash += total;
                } 
                // 2. Tracked Coins -> Add to holdings
                else {
                    const symbol = b.asset + 'USDC';
                    if (CONFIG.COINS.includes(symbol)) {
                        realHoldings[symbol] = total;
                    }
                }
            });

            state.balance = totalCash;
            state.holdings = realHoldings;

            if (!state.initialBalanceLogged) {
                logAction(`SHARK MIRROR: Sinkroniziran ukupni balans ${state.balance.toFixed(2)}$`, "SUCCESS");
                state.initialBalanceLogged = true;
            }

            // UI Update
            updateUI();
            renderHoldings();
        } else if (!state.liveMode) {
            // Restore virtual state if bridge is dead
            state.balance = parseFloat(localStorage.getItem('SHARK_WALLET')) || CONFIG.INITIAL_BALANCE;
            state.holdings = JSON.parse(localStorage.getItem('SHARK_HOLDINGS')) || {};
        }
    } catch (e) {
        state.bridgeConnected = false;
        console.error("DEBUG - CONNECTION ERROR:", e);
        console.error("DEBUG - SOURCE URL:", state.bridgeUrl);

        if (state.liveMode) {
            state.liveMode = false;
            if (document.getElementById('liveModeToggle')) document.getElementById('liveModeToggle').checked = false;
            logAction("VEZA S BRIDGE-OM NEUSPJEŠNA. Provjerite IP adresu!", "ERROR");
        }
        console.warn("Bridge Connection Failed:", e.message);
    }

    updateBridgeUI();
}

function updateBridgeUI() {
    const statusEl = document.getElementById('bridgeStatus');
    const mirrorBadge = document.getElementById('mirrorBadge');

    if (statusEl) {
        statusEl.className = 'bridge-status ' + (state.bridgeConnected ? 'connected' : 'disconnected');
        statusEl.innerHTML = (state.bridgeConnected ? '<i class="fas fa-link"></i> CONNECTED' : '<i class="fas fa-unlink"></i> DISCONNECTED');
        statusEl.onclick = changeBridgeUrl;
    }

    if (mirrorBadge) {
        if (state.bridgeConnected) {
            mirrorBadge.classList.add('active');
        } else {
            mirrorBadge.classList.remove('active');
        }
    }
}

function changeBridgeUrl() {
    const newUrl = prompt("Unesite IP adresu svog laptopa (npr. http://192.168.1.5:3000):", state.bridgeUrl);
    if (newUrl) {
        state.bridgeUrl = newUrl;
        localStorage.setItem('SHARK_BRIDGE_URL', newUrl);
        checkBridgeStatus();
    }
}

function initAutoTrade() {
    const toggle = document.getElementById('autoTradeToggle');
    const pilotBtn = document.getElementById('btnToggleAutoPilot');

    const updateAutoUI = () => {
        const statusText = document.getElementById('pilotStatus');
        const btnText = document.getElementById('pilotBtnText');
        const pilotCard = document.getElementById('pilotCard');

        if (state.autoTrade) {
            if (statusText) statusText.innerText = "SHARK IS HUNTING...";
            if (btnText) btnText.innerText = "DEACTIVATE AI";
            if (pilotBtn) pilotBtn.classList.add('active');
            if (toggle) toggle.checked = true;
        } else {
            if (statusText) statusText.innerText = "AI IS STANDING BY...";
            if (btnText) btnText.innerText = "ACTIVATE AI";
            if (pilotBtn) pilotBtn.classList.remove('active');
            if (toggle) toggle.checked = false;
        }
    };

    if (toggle) {
        toggle.checked = state.autoTrade;
        toggle.addEventListener('change', (e) => {
            state.autoTrade = e.target.checked;
            localStorage.setItem('SHARK_AUTOTRADE', state.autoTrade);
            logAction(`AI Auto-Trade: ${state.autoTrade ? 'AKTIVIRAN' : 'DEAKTIVIRAN'}`, "INFO");
            updateAutoUI();
        });
    }

    if (pilotBtn) {
        pilotBtn.addEventListener('click', () => {
            state.autoTrade = !state.autoTrade;
            localStorage.setItem('SHARK_AUTOTRADE', state.autoTrade);
            logAction(`AI Auto-Pilot: ${state.autoTrade ? 'ON' : 'OFF'}`, state.autoTrade ? "SUCCESS" : "WARNING");
            updateAutoUI();
        });
    }

    updateAutoUI();
}

function initTradingMode() {
    const select = document.getElementById('tradingModeSelect');
    if (select) {
        select.value = state.tradingMode;
        select.addEventListener('change', (e) => {
            state.tradingMode = e.target.value;
            localStorage.setItem('SHARK_TRADING_MODE', state.tradingMode);

            const modeNames = {
                'zen': 'ZEN SHARK',
                'balanced': 'BALANCED SHARK',
                'smart': 'SMART SHARK',
                'hungry': 'HUNGRY SHARK',
                'hyper': 'HYPER CONTRARIAN'
            };
            logAction(`STRATEGIJA: ${modeNames[state.tradingMode] || state.tradingMode.toUpperCase()}`, "INFO");
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

    title.innerText = `${type.toUpperCase()} ${symbol.replace('USDC', '')}`;
    modal.classList.add('active');
    document.getElementById('tradeAmount').value = '';
    document.getElementById('tradeAmount').focus();
}

async function executeTrade() {
    const amountUSDC = parseFloat(document.getElementById('tradeAmount').value);
    if (!amountUSDC || amountUSDC <= 0) return alert("Unesite ispravan iznos.");

    const price = state.prices[activeTrade.symbol]?.price;
    if (!price) return alert("Cijena nije dostupna.");

    const fee = amountUSDC * CONFIG.BINANCE_FEE;


    if (state.liveMode) {
        if (amountUSDC < 5.1) return alert("Binance minimum (MIN_NOTIONAL) je 5.10 USDC po nalogu.");
        
        // Manualni trade na Binanceu
        logAction(`LIVE MANUAL: Pokrećem ${activeTrade.type.toUpperCase()} za ${activeTrade.symbol}...`, "INFO");
        try {
            const res = await fetch(`${state.bridgeUrl}/api/order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({
                    symbol: activeTrade.symbol,
                    side: activeTrade.type.toUpperCase(),
                    quoteOrderQty: amountUSDC
                })
            });
            const data = await res.json();
            if (res.ok) {
                logAction(`MANUAL USPJEH: ${activeTrade.type.toUpperCase()} ${activeTrade.symbol} za ${amountUSDC}$`, "SUCCESS");
                checkBridgeStatus();
                closeModal();
            } else {
                alert(`Binance greška: ${data.error?.msg || 'Nepoznato'}`);
                logAction(`BINANCE GREŠKA: ${data.error?.msg}`, "ERROR");
            }
        } catch (e) {
            alert("Greška u komunikaciji s Bridge-om.");
            logAction(`BRIDGE ERROR (Manual).`, "ERROR");
        }
    } else {
        // SIMULATION LOGIC
        if (activeTrade.type === 'buy') {
            if (amountUSDC + fee > state.balance) return alert("Nedovoljno USDC za kupnju i naknadu.");
            state.balance -= (amountUSDC + fee);
            const coinAmount = amountUSDC / price;
            state.holdings[activeTrade.symbol] = (state.holdings[activeTrade.symbol] || 0) + coinAmount;

            addTradeToHistory(activeTrade.symbol, 'BUY', coinAmount, price, fee);
            logAction(`Kupljeno ${coinAmount.toFixed(4)} ${activeTrade.symbol.replace('USDC', '')} (Fee: ${fee.toFixed(4)} $)`, "BUY");
        } else {
            const currentHolding = state.holdings[activeTrade.symbol] || 0;
            const coinToSell = amountUSDC / price;
            if (coinToSell > currentHolding) return alert("Nemate dovoljno kovanica za prodaju.");

            const netAmount = amountUSDC - fee;
            state.balance += netAmount;
            state.holdings[activeTrade.symbol] -= coinToSell;

            addTradeToHistory(activeTrade.symbol, 'SELL', coinToSell, price, fee);
            logAction(`Prodano ${coinToSell.toFixed(4)} ${activeTrade.symbol.replace('USDC', '')} (Net: ${netAmount.toFixed(2)} $, Fee: ${fee.toFixed(4)} $)`, "SELL");
        }
        saveState();
        updateUI();
        renderHoldings();
        renderHistory();
        closeModal();
    }
}

function saveState() {
    localStorage.setItem('SHARK_WALLET', state.balance);
    localStorage.setItem('SHARK_HOLDINGS', JSON.stringify(state.holdings));
    localStorage.setItem('SHARK_HISTORY', JSON.stringify(state.history));
}

async function fetchPrices() {
    try {
        // Optimizirani Binance poziv (samo traženi simboli)
        const symbolsQuery = encodeURIComponent(JSON.stringify(CONFIG.COINS));
        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsQuery}`);
        const data = await response.json();

        // Binance vraća instancu objekta s greškom ako nešto ne štima, ili array.
        const filtered = Array.isArray(data) ? data : (data.code ? [] : [data]);

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
        const coinPrefix = symbol.replace('USDC', '').toLowerCase();
        card.className = 'price-card glass';
        card.id = `card-${symbol}`;
        card.innerHTML = `
            <div class="coin-info">
                <i class="${meta.icon}"></i>
                <div>
                    <div class="symbol">${symbol.replace('USDC', '')}/USDC</div>
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
    const search = symbol.replace('USDC', '').toLowerCase();

    if (!Array.isArray(state.news)) return score;

    state.news.forEach(item => {
        const text = ((item.TITLE || item.title || "") + (item.BODY || item.body || "")).toLowerCase();
        if (text.includes(search)) {
            SHARK_AI.BULL_WORDS.forEach(w => { if (text.includes(w)) score += 5; });
            SHARK_AI.BEAR_WORDS.forEach(w => { if (text.includes(w)) score -= 8; });
        }
    });

    return Math.min(100, Math.max(0, score));
}

function updatePriceCards() {
    CONFIG.COINS.forEach(symbol => {
        const coinPrefix = symbol.replace('USDC', '').toLowerCase();
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
async function runAutoTradeAgent() {
    const now = Date.now();
    if (now - lastTradeTime < 10000) return; // limit trade rate

    const fngValue = state.marketWisdom?.fng?.value || 50;

    // HYPER CONTRARIAN SHARK (v0.36)
    if (state.tradingMode === 'hyper') {
        const isPanic = fngValue <= 30;

        if (isPanic) {
            for (const symbol of CONFIG.COINS) {
                const coin = state.prices[symbol];
                if (!coin) continue;

                const minBalance = state.liveMode ? 15 : 100;
                const tradeAmount = state.liveMode ? 15 : 100;

                if (state.balance >= minBalance) {
                    const currentHolding = state.holdings[symbol] || 0;
                    if (currentHolding < 0.0001) {
                        state.balance -= tradeAmount;
                        await autoExecuteTrade(symbol, 'buy', tradeAmount, "HYPER PANIC BUY");
                        lastTradeTime = now;
                        updateUI();
                        return;
                    }
                }
            }
        }

        // Sell logic for Hyper
        for (const symbol of CONFIG.COINS) {
            const coin = state.prices[symbol];
            const currentHolding = state.holdings[symbol] || 0;
            if (coin && currentHolding > 0) {
                const sellVal = currentHolding * coin.price;
                if (state.liveMode && sellVal < 5.1) continue; // Binance MIN_NOTIONAL zaštita od spama za sitniš (dust)

                if (coin.change > 10 || fngValue > 70) {
                    await autoExecuteTrade(symbol, 'sell', sellVal, "HYPER EXIT");
                    lastTradeTime = now;
                }
                else if (coin.change < -15) {
                    await autoExecuteTrade(symbol, 'sell', sellVal, "HYPER STOP LOSS");
                    lastTradeTime = now;
                }
            }
        }
        return;
    }

    // --- STANDARD MODES (Zen, Balanced, Smart, Hungry) ---
    const modeConfigs = {
        'zen': { entryThreshold: -2.0, label: 'ZEN' },
        'balanced': { entryThreshold: -0.5, label: 'BALANCED' },
        'smart': { entryThreshold: 0.1, label: 'SMART' },
        'hungry': { entryThreshold: 2.5, label: 'HUNGRY' }
    };

    const currentMode = modeConfigs[state.tradingMode] || modeConfigs['balanced'];

    // Inverse Cramer / Extreme Greed Protection (Standard modes only)
    if (fngValue > 80) {
        if (now % 60000 < 5000) logAction(`EXTREME GREED detected! ${currentMode.label} is staying in deep water.`, "WARNING");
        return;
    }

    const entryThreshold = currentMode.entryThreshold;

    for (const symbol of CONFIG.COINS) {
        const coin = state.prices[symbol];
        if (!coin) continue;

        const sentiment = state.sentiment[symbol] || 50;
        const minBalance = state.liveMode ? 15 : 100;
        const tradeAmount = state.liveMode ? 15 : 100;

        // Buying logic
        if (coin.change <= entryThreshold && sentiment >= 45 && state.balance >= minBalance) {
            const currentHolding = state.holdings[symbol] || 0;
            if (currentHolding < 0.0001) {
                state.balance -= tradeAmount;
                await autoExecuteTrade(symbol, 'buy', tradeAmount, `${currentMode.label} ENTRY`);
                lastTradeTime = now;
                updateUI();
            }
        }

        // Selling logic
        const currentHolding = state.holdings[symbol] || 0;
        if (currentHolding > 0) {
            const sellVal = currentHolding * coin.price;
            if (state.liveMode && sellVal < 5.1) continue; // Binance MIN_NOTIONAL zaštita od spama za sitniš (dust)

            if (coin.change > SHARK_AI.TAKE_PROFIT) {
                await autoExecuteTrade(symbol, 'sell', sellVal, "PROFIT");
                lastTradeTime = now;
            }
            else if (coin.change < SHARK_AI.STOP_LOSS) {
                await autoExecuteTrade(symbol, 'sell', sellVal, "STOP LOSS");
                lastTradeTime = now;
            }
        }
    }
}

async function autoExecuteTrade(symbol, type, amountUSDC, reason = "") {
    const price = state.prices[symbol].price;
    const fee = amountUSDC * CONFIG.BINANCE_FEE;

    if (state.liveMode) {
        try {
            logAction(`LIVE ${type.toUpperCase()}: Pokušavam izvršiti red za ${symbol}...`, "INFO");
            const res = await fetch(`${state.bridgeUrl}/api/order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({
                    symbol: symbol,
                    side: type.toUpperCase(),
                    quoteOrderQty: amountUSDC
                })
            });
            const data = await res.json();
            if (res.ok) {
                logAction(`REAL MONEY ${type.toUpperCase()} USPJEŠAN: ${symbol} (${reason})`, "SUCCESS");
                checkBridgeStatus(); // Refresh balance/holdings from Binance
            } else {
                logAction(`BINANCE BROKER GREŠKA: ${data.error?.msg || 'Nepoznata greška'}`, "ERROR");
            }
        } catch (e) {
            logAction(`BRIDGE ERROR: Neuspješan kontakt s mostom.`, "ERROR");
        }
    } else {
        if (type === 'buy') {
            state.balance -= (amountUSDC + fee);
            const coinAmount = amountUSDC / price;
            state.holdings[symbol] = (state.holdings[symbol] || 0) + coinAmount;
            addTradeToHistory(symbol, 'BUY', coinAmount, price, fee, "AI: " + reason);
            logAction(`AI KUPNJA: ${coinAmount.toFixed(4)} ${symbol.replace('USDC', '')} (Fee: ${fee.toFixed(4)}$)`, "BUY");
        } else {
            state.balance += (amountUSDC - fee);
            const coinAmount = state.holdings[symbol];
            state.holdings[symbol] = 0;
            addTradeToHistory(symbol, 'SELL', coinAmount, price, fee, "AI: " + reason);
            logAction(`AI PRODAJA: ${symbol.replace('USDC', '')} (Net: ${(amountUSDC - fee).toFixed(2)}$, Fee: ${fee.toFixed(4)}$)`, "SELL");
        }
        saveState();
        updateUI();
        renderHoldings();
        renderHistory();
    }
}

function addTradeToHistory(symbol, type, amount, price, fee, context = "") {
    const entry = {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        symbol: symbol.replace('USDC', ''),
        type: type,
        amount: amount,
        price: price,
        fee: fee,
        total: type === 'BUY' ? -(amount * price + fee) : (amount * price - fee),
        context: context
    };
    state.history.unshift(entry);
    if (state.history.length > 50) state.history.pop();
}

function renderHistory() {
    const container = document.getElementById('tradeHistory');
    if (!container) return;

    if (state.history.length === 0) {
        container.innerHTML = '<div class="empty-history">Nema odrađenih trejdova.</div>';
        return;
    }

    container.innerHTML = state.history.map(t => `
        <div class="history-item">
            <span class="time">${t.time}</span>
            <span class="symbol">${t.symbol}</span>
            <span class="type ${t.type.toLowerCase()}">${t.type}</span>
            <span class="value ${t.total > 0 ? 'success' : 'error'}">
                ${t.total > 0 ? '+' : ''}${t.total.toFixed(2)} $
            </span>
            <span class="fee">Fee: ${t.fee.toFixed(4)} $</span>
        </div>
    `).join('');
}

// --- NEWS ENGINE ---
async function fetchNews() {
    try {
        // Novi CryptoCompare Data API koji radi bez ključa (v1)
        const response = await fetch('https://data-api.cryptocompare.com/news/v1/article/list?lang=EN');
        const data = await response.json();
        
        if (data && Array.isArray(data.Data)) {
            state.news = data.Data;
            renderNews(data.Data.slice(0, 6));
        } else {
            console.warn("Shark: Vijesti nisu u očekivanom formatu (preskačem).");
            state.news = [];
            renderNews([]);
        }
    } catch (err) {
        console.error("Shark: Greška pri dohvaćanju vijesti", err);
        state.news = [];
    }
}

function renderNews(news) {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    news.forEach(item => {
        const card = document.createElement('div');
        card.className = 'news-card glass';
        
        // Podrška za stari i novi format (mala/velika slova)
        const imageUrl = item.IMAGE_URL || item.imageurl;
        const sourceName = item.SOURCE_DATA?.NAME || item.source;
        const title = item.TITLE || item.title;
        const url = item.URL || item.url;

        card.innerHTML = `
            <img src="${imageUrl}" alt="news">
            <div class="news-content">
                <span class="source">${sourceName}</span>
                <h4>${title}</h4>
            </div>
        `;
        card.onclick = () => window.open(url, '_blank');
        grid.appendChild(card);
    });
}

function analyzeMarket() {
    const pulseValue = document.getElementById('marketSentiment');
    const btc = state.prices['BTCUSDC'];

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
                <div class="symbol">${symbol.replace('USDC', '')}</div>
                <div class="amount">${amount.toFixed(4)}</div>
            </div>
            <div class="holding-value">
                <span class="val">${totalValue.toLocaleString('hr-HR', { minimumFractionDigits: 2 })} USDC</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function updateUI() {
    const balanceEl = document.getElementById('totalBalance');
    const labelEl = document.querySelector('.wallet-stat .label');

    let multiplier = state.showNetProfit ? 0.88 : 1.0;

    if (state.showNetProfit) {
        if (labelEl) labelEl.innerText = "NETO ISPLATA (-12%)";
        if (balanceEl) balanceEl.style.color = "var(--accent)";
    } else {
        if (labelEl) labelEl.innerText = state.liveMode ? "TOTAL LIVE BALANCE" : "TOTAL VIRTUAL BALANCE";
        if (balanceEl) balanceEl.style.color = "var(--success)";
    }

    if (balanceEl) {
        const netWorth = calculateNetWorth() * multiplier;
        balanceEl.innerText = netWorth.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDC";
    }

    // Update individual coin grid values if they exist (holding-card)
    CONFIG.COINS.forEach(symbol => {
        const valEl = document.getElementById(`val-${symbol}`);
        if (valEl && state.prices[symbol]) {
            const amount = state.holdings[symbol] || 0;
            const value = amount * state.prices[symbol].price * multiplier;
            valEl.innerText = value.toFixed(2) + " USDC";
        }
    });

    updateSummary();
}

function calculateNetWorth() {
    let total = state.balance;
    Object.keys(state.holdings).forEach(symbol => {
        const amount = state.holdings[symbol];
        const price = state.prices[symbol]?.price || 0;
        total += amount * price;
    });
    return total;
}

function updateSummary() {
    // Optional: add more stats to the UI summary
}

function initNetPayout() {
    const toggle = document.getElementById('netPayoutToggle');
    if (toggle) {
        toggle.checked = state.showNetProfit;
        toggle.addEventListener('change', (e) => {
            state.showNetProfit = e.target.checked;
            localStorage.setItem('SHARK_NET_PROFIT', state.showNetProfit);
            logAction(`Prikaz: ${state.showNetProfit ? 'NETO PROZOR (-12%)' : 'BRUTO IZNOS'}`, "INFO");
            updateUI();
        });
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