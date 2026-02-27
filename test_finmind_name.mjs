async function testFinMindName() {
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log("TaiwanStockInfo result:", data.data.slice(0, 3));
        const tsmc = data.data.find(s => s.stock_id === '2330');
        console.log("TSMC:", tsmc);
    } catch (e) {
        console.error("FinMind error:", e.message);
    }
}
testFinMindName();
