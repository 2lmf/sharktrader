require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const SocksProxyAgent = require('socks-proxy-agent');

const PROXY_URL = process.env.PROXY_URL || 'socks5h://127.0.0.1:1080';
const USE_PROXY = process.env.USE_PROXY === 'true';
const httpsAgent = USE_PROXY ? new SocksProxyAgent(PROXY_URL) : null;

function generateOKXSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method.toUpperCase() + requestPath + body;
    return crypto.createHmac('sha256', process.env.OKX_SECRET_KEY)
        .update(message)
        .digest('base64');
}

function getOKXHeaders(method, requestPath, body = '') {
    const timestamp = new Date().toISOString();
    return {
        'OK-ACCESS-KEY': process.env.OKX_API_KEY,
        'OK-ACCESS-SIGN': generateOKXSignature(timestamp, method, requestPath, body),
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE,
        'Content-Type': 'application/json'
    };
}

function printBalance(data) {
    console.log("💰 Balans tvojih Asseta:");
    const details = data.data?.[0]?.details || [];
    const nonZero = details.filter(d => parseFloat(d.availBal) > 0 || parseFloat(d.frozenBal) > 0);

    if (nonZero.length === 0) {
        console.log("  (Nema asseta s balansom > 0)");
    } else {
        nonZero.forEach(d => console.log(` - ${d.ccy}: ${d.availBal} (Available), ${d.frozenBal} (Frozen)`));
    }
}

async function checkEndpoint(baseUrl, isDemo) {
    const path = '/api/v5/account/balance';
    const domainName = baseUrl.replace('https://', '');
    const modeName = isDemo ? 'DEMO' : 'LIVE';
    
    const headers = getOKXHeaders('GET', path);
    if (isDemo) {
        headers['x-simulated-auth'] = '1';
    }

    try {
        const response = await axios.get(`${baseUrl}${path}`, { 
            headers,
            httpsAgent: httpsAgent,
            httpAgent: httpsAgent
        });
        
        if (response.data.code === '0') {
            console.log(`✅ USPJEH! Povezan na ${domainName} (${modeName} način rada).`);
            printBalance(response.data);
            if (isDemo) {
                console.log("⚠️ NAPOMENA: API ključ je kreiran za DEMO TRADING. Sve transakcije su simulirane.");
            } else {
                console.log("⚠️ NAPOMENA: Povezani ste na stvarne (LIVE) fondove.");
            }
            return true;
        } else {
            console.log(`❌ OKX Greška: ${response.data.msg} (Kod: ${response.data.code})`);
        }
    } catch (err) {
        const data = err.response?.data || {};
        console.log(`❌ HTTP Greška: ${data.msg || err.message} (Kod: ${data.code || 'N/A'})`);
    }
    return false;
}

async function testConnection() {
    console.log("🔍 Pokrećem dijagnostiku OKX API-ja...");
    console.log(`🔑 Provjeravam ključ koji počinje s: ${process.env.OKX_API_KEY?.substring(0, 6)}...`);

    const endpoints = [
        { url: 'https://www.okx.com', isDemo: false },
        { url: 'https://www.okx.com', isDemo: true },
        { url: 'https://my.okx.com', isDemo: false },
        { url: 'https://my.okx.com', isDemo: true }
    ];

    for (const endpoint of endpoints) {
        const success = await checkEndpoint(endpoint.url, endpoint.isDemo);
        if (success) {
            console.log("\n🎉 Dijagnostika završena s uspjehom!");
            return;
        }
        console.log("-----------------------------------------");
    }

    console.log("\n❌ Svi pokušaji spajanja su neuspješni.");
    console.log("Savjet: Provjeri jesi li točno prekopirao API Key, Secret i Passphrase iz OKX sučelja te da ključ nije obrisan/istekao.");
}

testConnection();
