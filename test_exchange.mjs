async function testExchange() {
    try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await res.json();
        console.log("USD to TWD:", data.rates.TWD);

        // Test direct conversion
        const twdRes = await fetch('https://api.exchangerate-api.com/v4/latest/TWD');
        const twdData = await twdRes.json();
        console.log("TWD to USD:", twdData.rates.USD);
    } catch (error) {
        console.error("Fetch error:", error);
    }
}

testExchange();
