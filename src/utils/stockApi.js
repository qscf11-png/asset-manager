// src/utils/stockApi.js
// 混合資料來源以確保報價「當天正確」：
//   1. 上市 (TSE)  ── TWSE MI_INDEX 直連（Access-Control-Allow-Origin: *，含今日收盤）
//   2. 上櫃/興櫃  ── FinMind fallback（可能 T-1，但至少能取到；不需 proxy）

const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';
const TWSE_MI_INDEX_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&type=ALLBUT0999';

const priceCache = new Map();
const CACHE_TTL = 3 * 60 * 1000;

// TWSE 全上市股票當日收盤價的整批快取
let twseTableCache = null;
let twseTableTime = 0;
const TWSE_TABLE_TTL = 5 * 60 * 1000;

const getCached = (ticker) => {
    const entry = priceCache.get(ticker);
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry;
    return null;
};

const parseNumber = (str) => {
    if (str === null || str === undefined) return NaN;
    return parseFloat(String(str).replace(/,/g, ''));
};

// 取得 TWSE 當日上市所有股票收盤價 → Map<ticker, {price, name}>
const fetchTWSETable = async () => {
    if (twseTableCache && Date.now() - twseTableTime < TWSE_TABLE_TTL) {
        return twseTableCache;
    }
    const res = await fetch(TWSE_MI_INDEX_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
    const data = await res.json();

    const tables = data.tables || [];
    const dailyTable = tables.find(t => t.title && t.title.includes('每日收盤行情'));
    if (!dailyTable) throw new Error('TWSE 回應找不到每日收盤行情表');

    const map = new Map();
    for (const row of dailyTable.data || []) {
        const ticker = row[0];
        const name = row[1];
        const close = parseNumber(row[8]);
        if (ticker && !isNaN(close) && close > 0) {
            map.set(ticker, { price: close, name });
        }
    }
    twseTableCache = map;
    twseTableTime = Date.now();
    return map;
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

const getStartDate = () => {
    return new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
};

// FinMind fallback（上櫃/興櫃或 TWSE 缺資料時）
const fetchFinMindPrice = async (ticker, timeoutMs = 10000) => {
    const url = `${FINMIND_URL}?dataset=TaiwanStockPrice&data_id=${ticker}&start_date=${getStartDate()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 200) throw new Error(data.msg || 'API 錯誤');
    if (!data.data || data.data.length === 0) throw new Error('查無資料');
    for (let i = data.data.length - 1; i >= 0; i--) {
        const close = data.data[i].close;
        if (close && close > 0) return close;
    }
    throw new Error('無有效收盤價');
};

export const getTaiwanStockInfo = async (ticker) => {
    const cached = getCached(ticker);
    if (cached) return { price: cached.price, symbol: ticker, name: cached.name };

    await ensureStockList();

    // 1. 先試 TWSE (上市當日收盤)
    try {
        const twseMap = await fetchTWSETable();
        const hit = twseMap.get(ticker);
        if (hit) {
            const name = hit.name || getStockName(ticker) || `台股 ${ticker}`;
            priceCache.set(ticker, { price: hit.price, name, time: Date.now() });
            return { price: hit.price, symbol: ticker, name };
        }
    } catch (err) {
        console.warn('TWSE 查詢失敗，改用 FinMind:', err.message);
    }

    // 2. 上市查無 → FinMind (上櫃/興櫃)
    const stockName = getStockName(ticker) || `台股 ${ticker}`;
    try {
        const price = await fetchFinMindPrice(ticker);
        priceCache.set(ticker, { price, name: stockName, time: Date.now() });
        return { price, symbol: ticker, name: stockName };
    } catch (err) {
        throw new Error(`查無 ${ticker} 報價：${err.message}`);
    }
};

export const batchGetStockPrices = async (tickers, onProgress) => {
    await ensureStockList();

    const results = new Map();
    let completed = 0;

    // 先處理快取
    const uncached = [];
    tickers.forEach(t => {
        const cached = getCached(t);
        if (cached) {
            results.set(t, { success: true, price: cached.price, name: cached.name, symbol: t });
            completed++;
        } else {
            uncached.push(t);
        }
    });
    onProgress?.(completed, tickers.length);

    if (uncached.length === 0) return results;

    // 1. 一次 fetch TWSE 全部上市，命中的直接寫入 results
    let twseMap = null;
    try {
        twseMap = await fetchTWSETable();
    } catch (err) {
        console.warn('TWSE 批次抓取失敗，全走 FinMind:', err.message);
    }

    const needFallback = [];
    for (const t of uncached) {
        if (twseMap && twseMap.has(t)) {
            const hit = twseMap.get(t);
            const name = hit.name || getStockName(t) || `台股 ${t}`;
            priceCache.set(t, { price: hit.price, name, time: Date.now() });
            results.set(t, { success: true, price: hit.price, name, symbol: t });
            completed++;
        } else {
            needFallback.push(t);
        }
    }
    onProgress?.(completed, tickers.length);

    if (needFallback.length === 0) return results;

    // 2. 剩下的（上櫃/興櫃）走 FinMind 並行查詢
    const CONCURRENCY = 8;
    const worker = async (ticker) => {
        try {
            const price = await fetchFinMindPrice(ticker, 10000);
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

    for (let i = 0; i < needFallback.length; i += CONCURRENCY) {
        const batch = needFallback.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(worker));
    }

    return results;
};
