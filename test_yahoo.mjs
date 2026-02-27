async function fetchYahoo() {
    try {
        const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/2330.TW', {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        console.log("Yahoo status:", res.status);
        const data = await res.json();
        console.log("Yahoo data:", data.chart.result[0].meta.regularMarketPrice);
    } catch (e) {
        console.error("Yahoo error:", e.message);
    }
}
fetchYahoo();
