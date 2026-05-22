// src/utils/stockApi.js
// 上市/上櫃: TWSE MIS API (mis.twse.com.tw)
// 興櫃: TPEX OpenAPI (tpex_esb_latest_statistics)
// 全部透過 CORS proxy 備援呼叫

const TWSE_API = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';
const TPEX_ESB_API = 'https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics';

const CORS_PROXIES = [
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// corsproxy.io 連不到 tpex.org.tw，興櫃股要跳過它
const TPEX_PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const priceCache = new Map();
const CACHE_TTL = 3 * 60 * 1000;

let esbCache = null;
let esbCacheTime = 0;
const ESB_CACHE_TTL = 10 * 60 * 1000;

const getCached = (ticker) => {
    const entry = priceCache.get(ticker);
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry;
    return null;
};

const buildExCh = (ticker, market) => {
    if (market === 'otc') return `otc_${ticker}.tw`;
    return `tse_${ticker}.tw`;
};

const getMarketType = (ticker) => {
    try {
        const raw = localStorage.getItem('tw_stock_info');
        if (!raw) return null;
        const list = JSON.parse(raw);
        const stock = list.find(s => s.stock_id === ticker);
        if (!stock) return null;
        const otcTypes = new Set(['上櫃', 'OTC']);
        return otcTypes.has(stock.type) ? 'otc' : 'tse';
    } catch {
        return null;
    }
};

const ensureStockList = async () => {
    try {
        const existing = localStorage.getItem('tw_stock_info');
        if (existing) return;
        const res = await fetch('https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo');
        const data = await res.json();
        if (data.data) {
            localStorage.setItem('tw_stock_info', JSON.stringify(data.data));
        }
    } catch (e) {
        console.warn('取得股票清單失敗:', e);
    }
};

const getStockName = (ticker) => {
    try {
        const raw = localStorage.getItem('tw_stock_info');
        if (!raw) return null;
        const list = JSON.parse(raw);
        const stock = list.find(s => s.stock_id === ticker);
        return stock?.stock_name || null;
    } catch {
        return null;
    }
};

const fetchWithProxies = async (targetUrl, proxies, timeoutMs = 10000) => {
    for (let i = 0; i < proxies.length; i++) {
        const proxyUrl = proxies[i](targetUrl);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (!res.ok) {
                console.warn(`Proxy #${i} HTTP ${res.status}，嘗試下一個...`);
                continue;
            }
            return await res.json();
        } catch (err) {
            console.warn(`Proxy #${i} 失敗 (${err.message})，嘗試下一個...`);
        }
    }
    throw new Error('所有報價來源均無法連線，請稍後再試');
};

const fetchTWSE = async (exChList) => {
    const url = `${TWSE_API}?ex_ch=${exChList.join('|')}`;
    const data = await fetchWithProxies(url, CORS_PROXIES, 10000);
    return (data.msgArray || []).filter(item => item.c && item.c.trim() !== '');
};

const fetchESBList = async () => {
    if (esbCache && Date.now() - esbCacheTime < ESB_CACHE_TTL) {
        return esbCache;
    }
    const data = await fetchWithProxies(TPEX_ESB_API, TPEX_PROXIES, 15000);
    const arr = Array.isArray(data) ? data : (data.data || []);
    esbCache = new Map();
    arr.forEach(item => {
        if (item.SecuritiesCompanyCode) {
            esbCache.set(item.SecuritiesCompanyCode, item);
        }
    });
    esbCacheTime = Date.now();
    return esbCache;
};

const parseESBPrice = (item) => {
    if (!item) return null;
    const latest = parseFloat(item.LatestPrice);
    if (!isNaN(latest) && latest > 0) return latest;
    const avg = parseFloat(item.Average);
    if (!isNaN(avg) && avg > 0) return avg;
    const prev = parseFloat(item.PreviousAveragePrice);
    if (!isNaN(prev) && prev > 0) return prev;
    return null;
};

const tryFetchESB = async (ticker, fallbackName) => {
    try {
        const list = await fetchESBList();
        const item = list.get(ticker);
        if (!item) return null;
        const price = parseESBPrice(item);
        if (price === null) return null;
        return { price, name: item.CompanyName || fallbackName };
    } catch (err) {
        console.warn('興櫃查詢失敗:', err.message);
        return null;
    }
};

export const getTaiwanStockInfo = async (ticker) => {
    const cached = getCached(ticker);
    if (cached) {
        return { price: cached.price, symbol: ticker, name: cached.name };
    }

    await ensureStockList();
    const stockName = getStockName(ticker) || `台股 ${ticker}`;
    const market = getMarketType(ticker);

    const tryFetch = async (m) => {
        const exCh = buildExCh(ticker, m);
        const results = await fetchTWSE([exCh]);
        if (!results.length) throw new Error('查無資料');
        const item = results[0];
        const price = parseFloat(item.z);
        if (isNaN(price) || item.z === '-') {
            throw new Error('目前無成交價');
        }
        return { price, name: item.n || stockName };
    };

    let result = null;
    if (market) {
        try {
            result = await tryFetch(market);
        } catch {
            const fallback = market === 'otc' ? 'tse' : 'otc';
            try { result = await tryFetch(fallback); } catch { /* noop */ }
        }
    } else {
        try {
            result = await tryFetch('tse');
        } catch {
            try { result = await tryFetch('otc'); } catch { /* noop */ }
        }
    }

    // 上市/上櫃都查不到，最後試興櫃
    if (!result) {
        result = await tryFetchESB(ticker, stockName);
    }

    if (!result) {
        throw new Error(`查無代碼 ${ticker} 的報價，可能暫無交易或非交易時段`);
    }

    priceCache.set(ticker, { price: result.price, name: result.name, time: Date.now() });
    return { price: result.price, symbol: ticker, name: result.name };
};

export const batchGetStockPrices = async (tickers, onProgress) => {
    await ensureStockList();

    const results = new Map();

    // 先回傳快取
    tickers.forEach(t => {
        const cached = getCached(t);
        if (cached) {
            results.set(t, { success: true, price: cached.price, name: cached.name, symbol: t });
        }
    });

    const uncached = tickers.filter(t => !results.has(t));

    if (uncached.length === 0) {
        onProgress?.(tickers.length, tickers.length);
        return results;
    }

    // 用 TWSE API 的批次查詢能力，一次查多支（先全部用已知市場別查）
    const exChList = uncached.map(ticker => {
        const market = getMarketType(ticker);
        return buildExCh(ticker, market || 'tse');
    });

    const BATCH_SIZE = 20;
    let completed = results.size;

    for (let i = 0; i < exChList.length; i += BATCH_SIZE) {
        const batchExCh = exChList.slice(i, i + BATCH_SIZE);
        const batchTickers = uncached.slice(i, i + BATCH_SIZE);

        try {
            const items = await fetchTWSE(batchExCh);
            const foundCodes = new Set(items.map(it => it.c));
            const missing = batchTickers.filter(t => !foundCodes.has(t));

            for (const item of items) {
                const t = item.c;
                const price = parseFloat(item.z);
                const name = item.n || getStockName(t) || `台股 ${t}`;

                if (!isNaN(price) && item.z !== '-') {
                    priceCache.set(t, { price, name, time: Date.now() });
                    results.set(t, { success: true, price, name, symbol: t });
                } else {
                    results.set(t, { success: false, error: '目前無成交價' });
                }
                completed++;
                onProgress?.(completed, tickers.length);
            }

            // 上市查不到的，改用上櫃重查
            if (missing.length > 0) {
                const otcExCh = missing.map(t => buildExCh(t, 'otc'));
                try {
                    const otcItems = await fetchTWSE(otcExCh);
                    for (const item of otcItems) {
                        const t = item.c;
                        const price = parseFloat(item.z);
                        const name = item.n || getStockName(t) || `台股 ${t}`;

                        if (!isNaN(price) && item.z !== '-') {
                            priceCache.set(t, { price, name, time: Date.now() });
                            results.set(t, { success: true, price, name, symbol: t });
                        } else {
                            results.set(t, { success: false, error: '目前無成交價' });
                        }
                        completed++;
                        onProgress?.(completed, tickers.length);
                    }
                } catch { /* 上櫃查詢失敗忽略 */ }

                // 上市/上櫃都找不到的，最後試興櫃（整批一次查）
                if (missing.length > 0) {
                    try {
                        const esbList = await fetchESBList();
                        for (const t of missing) {
                            const item = esbList.get(t);
                            const price = parseESBPrice(item);
                            if (price !== null) {
                                const name = item.CompanyName || getStockName(t) || `台股 ${t}`;
                                priceCache.set(t, { price, name, time: Date.now() });
                                results.set(t, { success: true, price, name, symbol: t });
                            } else {
                                results.set(t, { success: false, error: '查無此代碼' });
                            }
                            completed++;
                            onProgress?.(completed, tickers.length);
                        }
                    } catch {
                        for (const t of missing) {
                            if (!results.has(t)) {
                                results.set(t, { success: false, error: '查無此代碼' });
                                completed++;
                                onProgress?.(completed, tickers.length);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            for (const t of batchTickers) {
                if (!results.has(t)) {
                    results.set(t, { success: false, error: err.message });
                    completed++;
                    onProgress?.(completed, tickers.length);
                }
            }
        }

        if (i + BATCH_SIZE < exChList.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    return results;
};
