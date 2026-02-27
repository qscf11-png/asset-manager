async function testCors() {
    const url = 'https://corsproxy.io/?' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/2330.TW');
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log("corsproxy.io success:", data.chart.result[0].meta.symbol);
    } catch (err) {
        console.error("corsproxy.io error:", err);
    }
}

testCors();
