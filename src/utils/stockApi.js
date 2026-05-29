// src/utils/stockApi.js
// 改用 FinMind API 作為主要報價來源
// 優勢：CORS 友善（不需 proxy）、支援上市/上櫃/興櫃、速度快（~60ms/支）

const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';

const priceCache = new Map();
const CACHE_TTL = 3 * 60 * 1000;

const getCached = (ticker) => {
    const entry = priceCache.get(ticker);
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry;
    return null;
};

const ensureStockList = async () => {
    try {
        if (localStorage.getItem('tw_stock_info')) return;
        const res = await fetch(`${FINMIND_URL}?dataset=TaiwanStockInfo`, {
            signal: AbortSignal.timeout(15000)
        });
        const data = await res.json();
        if (data.data) localStorage.setItem('tw_stock_info', JSON.stringify(data.data));
    } catch (e) {
        console.warn('取得股票清單失敗:', e);
    }
};

const getStockName = (ticker) => {
    try {
        const raw = localStorage.getItem('tw_stock_info');
        if (!raw) return null;
        const list = JSON.parse(raw);
        return list.find(s => s.stock_id === ticker)?.stock_name || null;
    } catch {
        return null;
    }
};

// 取得 7 天前作為起始日，確保至少能拿到最近一筆收盤價
const getStartDate = () => {
    return new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
};

const fetchSinglePrice = async (ticker, timeoutMs = 10000) => {
    const url = `${FINMIND_URL}?dataset=TaiwanStockPrice&data_id=${ticker}&start_date=${getStartDate()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 200) throw new Error(data.msg || 'API 錯誤');
    if (!data.data || data.data.length === 0) throw new Error('查無資料');

    // 從最後一筆往前找有效收盤價（避免假日或無交易日的 0 值）
    for (let i = data.data.length - 1; i >= 0; i--) {
        const close = data.data[i].close;
        if (close && close > 0) return close;
    }
    throw new Error('無有效收盤價');
};

export const getTaiwanStockInfo = async (ticker) => {
    const cached = getCached(ticker);
    if (cached) {
        return { price: cached.price, symbol: ticker, name: cached.name };
    }

    await ensureStockList();
    const stockName = getStockName(ticker) || `台股 ${ticker}`;

    try {
        const price = await fetchSinglePrice(ticker);
        priceCache.set(ticker, { price, name: stockName, time: Date.now() });
        return { price, symbol: ticker, name: stockName };
    } catch (err) {
        throw new Error(`查無 ${ticker} 報價：${err.message}`);
    }
};

export const batchGetStockPrices = async (tickers, onProgress) => {
    await ensureStockList();

    const results = new Map();
    const uncached = [];

    // 先處理快取命中的部分
    tickers.forEach(t => {
        const cached = getCached(t);
        if (cached) {
            results.set(t, { success: true, price: cached.price, name: cached.name, symbol: t });
        } else {
            uncached.push(t);
        }
    });

    let completed = results.size;
    onProgress?.(completed, tickers.length);

    if (uncached.length === 0) return results;

    // 限制併發數量避免 FinMind 速率限制
    const CONCURRENCY = 8;

    const worker = async (ticker) => {
        try {
            const price = await fetchSinglePrice(ticker, 10000);
            const name = getStockName(ticker) || `台股 ${ticker}`;
            priceCache.set(ticker, { price, name, time: Date.now() });
            results.set(ticker, { success: true, price, name, symbol: ticker });
        } catch (err) {
            results.set(ticker, { success: false, error: err.message });
        } finally {
            completed++;
            onProgress?.(completed, tickers.length);
        }
    };

    // 分批平行執行
    for (let i = 0; i < uncached.length; i += CONCURRENCY) {
        const batch = uncached.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(worker));
    }

    return results;
};
