async function testJSONP() {
    try {
        const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/2330.TW?callback=jsonpCallback');
        const text = await res.text();
        console.log("Response text start:", text.substring(0, 100));
    } catch (e) {
        console.error(e.message);
    }
}
testJSONP();
