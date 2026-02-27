async function testAllOriginsRaw() {
    try {
        const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/2330.TW'));
        console.log("raw status:", res.status);
        const data = await res.json();
        console.log("raw data:", data.chart.result[0].meta.regularMarketPrice);
    } catch (e) {
        console.error("raw error:", e.message);
    }
}
testAllOriginsRaw();
