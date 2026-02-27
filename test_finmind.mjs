async function testFinMind() {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    const dateStr = d.toISOString().split('T')[0];
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=2330&start_date=${dateStr}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log("FinMind response:", data.msg);
        if (data.data && data.data.length > 0) {
            console.log("FinMind latest close:", data.data[data.data.length - 1].close);
        }
    } catch (e) {
        console.error("FinMind error:", e.message);
    }
}
testFinMind();
