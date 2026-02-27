async function testYahooJSON() {
    const url = `https://corsproxy.io/?url=${encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/2330.TW')}`;
    try {
        const res = await fetch(url);
        const text = await res.text();
        console.log("corsproxy.io:", text.substring(0, 50));
    } catch (e) {
        console.error("corsproxy.io error:", e.message);
    }
}

async function testGoogleFinance() {
    const url = `https://corsproxy.io/?url=${encodeURIComponent('https://www.google.com/finance/quote/2330:TPE')}`;
    try {
        const res = await fetch(url);
        const text = await res.text();
        console.log("google finance length:", text.length);
    } catch (e) {
        console.error("google finance error:", e.message);
    }
}

testYahooJSON();
testGoogleFinance();
