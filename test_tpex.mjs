async function testTpex() {
    try {
        const res = await fetch('https://www.tpex.org.tw/openapi/v1/t187ap03_L');
        console.log("TPEx status:", res.status);
        const data = await res.json();
        const stock = data.find(s => s.SecuritiesCompanyCode === '3105');
        console.log("TPEx 3105:", stock);
    } catch (e) { console.error("TPEx error:", e.message); }
}
testTpex();
