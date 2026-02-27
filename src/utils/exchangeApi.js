// https://api.exchangerate-api.com/v4/latest/TWD

let exchangeRatesCache = null;
let lastFetchTime = null;

export const fetchExchangeRates = async () => {
    // Cache for 1 hour
    if (exchangeRatesCache && lastFetchTime && (Date.now() - lastFetchTime < 3600000)) {
        return exchangeRatesCache;
    }

    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (!response.ok) {
            throw new Error(`Exchange API error: ${response.status}`);
        }
        const data = await response.json();

        // We fetch relative to USD.
        // E.g., data.rates.TWD = 31.5
        // data.rates.JPY = 145.0
        // To get TWD per foreign currency (e.g., JPY to TWD):
        // 1 JPY = (1 / JPY rate against USD) * TWD rate against USD
        // Or fetch base TWD directly: https://api.exchangerate-api.com/v4/latest/TWD

        exchangeRatesCache = data.rates;
        lastFetchTime = Date.now();
        return exchangeRatesCache;
    } catch (error) {
        console.error("Failed to fetch exchange rates:", error);
        return null;
    }
};

export const calculateTWDValue = async (currency, amount) => {
    if (!currency || !amount) return 0;
    if (currency === 'TWD') return Number(amount);

    try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/TWD');
        const data = await res.json();
        const ratesForTWD = data.rates;

        // Convert to TWD
        // The API base is TWD, so data.rates.USD is how many USD for 1 TWD.
        // Or if we use base=USD from cache, TWD value = amount / rate_vs_USD * TWD_vs_USD

        // Example: data from TWD base:
        // USD: 0.032 -> 1 TWD = 0.032 USD -> 1 USD = 1/0.032 TWD

        const rate = ratesForTWD[currency];
        if (!rate) return 0;

        const twdValue = Number(amount) / rate;
        return Math.round(twdValue);
    } catch (error) {
        console.error("Exchange calculation error:", error);
        return 0;
    }
};
