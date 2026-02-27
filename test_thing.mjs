async function testThingProxy() {
    try {
        const res = await fetch('https://thingproxy.freeboard.io/fetch/' + 'https://query1.finance.yahoo.com/v8/finance/chart/2330.TW');
        console.log("thing status:", res.status);
    } catch (e) {
        console.error("thing error:", e.message);
    }
}
testThingProxy();
