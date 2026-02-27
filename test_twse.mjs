async function testTWSE() {
    try {
        const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
        console.log("TWSE status:", res.status);
        const data = await res.json();
        const stock = data.find(s => s.Code === '2330');
        console.log("TWSE data:", stock);
    } catch (e) {
        console.error("TWSE error:", e.message);
    }
}
testTWSE();
