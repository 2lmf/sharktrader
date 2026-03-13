require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const BINANCE_API_URL = 'https://api.binance.com';

function generateSignature(queryString) {
    return crypto
        .createHmac('sha256', process.env.BINANCE_SECRET_KEY)
        .update(queryString)
        .digest('hex');
}

async function testConnection() {
    console.log("🔍 Pokrećem dijagnostiku Binance API-ja...");
    console.log(`🔑 Provjeravam ključ koji počinje s: ${process.env.BINANCE_API_KEY.substring(0, 6)}...`);

    try {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = generateSignature(queryString);

        const response = await axios.get(`${BINANCE_API_URL}/api/v3/account?${queryString}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }
        });

        console.log("✅ USPJEH! Povezan s Binance-om.");
        console.log("💰 Balans tvojih Asseta:");
        const balances = response.data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
        balances.forEach(b => console.log(` - ${b.asset}: ${b.free} (Free), ${b.locked} (Locked)`));

        console.log("\n⚠️ NAPOMENA: Ako ovo radi, a trade ne radi, onda ti fali 'Enable Spot & Margin Trading' kvačica na Binance-u!");

    } catch (err) {
        console.error("\n❌ GREŠKA PRILIKOM SPAJANJA:");
        if (err.response) {
            console.error(`Kod: ${err.response.data.code}`);
            console.error(`Poruka: ${err.response.data.msg}`);

            if (err.response.data.code === -2015) {
                console.log("\n💡 Mogući uzroci za kôd -2015:");
                console.log("1. Ključevi su krivo kopirani (provjeri .env).");
                console.log("2. API ključ je istekao.");
                console.log("3. Tvoj trenutni IP nije na listi dopuštenih (vidi Binance dashboard).");
            }
        } else {
            console.error(err.message);
        }
    }
}

testConnection();
