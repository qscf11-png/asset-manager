async function test() {
    const url = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/2330.TW');
    const res = await fetch(url);
    const data = await res.json();
    console.log("allorigins:", data.contents ? data.contents.substring(0, 50) : 'no contents');
}
test();
