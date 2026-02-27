async function testCodeTabs() {
    try {
        const res = await fetch('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/2330.TW'));
        console.log("codetabs result length:", (await res.text()).length);
    } catch (e) { console.error(e.message); }
}
testCodeTabs();
