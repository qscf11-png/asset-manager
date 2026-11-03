// src/utils/stockApi.js
// 三軌報價策略（兼顧即時性與穩定度）：
//   1. 盤中（週一~五 09:00-13:30 台北）→ 自架 Cloudflare Worker 轉發 TWSE MIS API
//      → 取得即時盤中價（15 秒延遲，跟券商 app 等級）
//   2. 盤外 → TWSE MI_INDEX 直連（當日收盤，無 proxy）
//   3. 上櫃/興櫃或前兩軌查無 → FinMind TaiwanStockPrice（T-1 日線）

const WORKER_URL = 'https://asset-stock-proxy.qscf11.workers.dev';
const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';
const TWSE_MI_INDEX_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&type=ALLBUT0999';
const TWSE_MIS_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

const priceCache = new Map();
const CACHE_TTL = 60 * 1000;  // 盤中即時價快取 1 分鐘即可

// TWSE 當日收盤整表快取（盤外使用）
let twseTableCache = null;
let twseTableTime = 0;
const TWSE_TABLE_TTL = 5 * 60 * 1000;

const getCached = (ticker) => {
    const entry = priceCache.get(ticker);
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry;
    return null;
};

const parseNumber = (str) => {
    if (str === null || str === undefined || str === '-') return NaN;
    return parseFloat(String(str).replace(/,/g, ''));
};

// 判斷台股是否在盤中（週一~五 09:00-13:30 台北時間）
const isMarketOpen = () => {
    const now = new Date();
    // 取得當下台北時區的「這一刻」字串，用 toLocaleString + en-CA 格式比較穩
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        weekday: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const weekday = map.weekday; // Mon Tue Wed Thu Fri Sat Sun
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const hh = parseInt(map.hour, 10);
    const mm = parseInt(map.minute, 10);
    const totalMin = hh * 60 + mm;
    return totalMin >= 9 * 60 && totalMin <= 13 * 60 + 30;
};

// === 股票清單（判斷市場別用） ===
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

const getStockMeta = (ticker) => {
    try {
        const raw = localStorage.getItem('tw_stock_info');
        if (!raw) return { name: null, market: 'tse' };
        const list = JSON.parse(raw);
        const s = list.find(x => x.stock_id === ticker);
        if (!s) return { name: null, market: 'tse' };
        const otcTypes = new Set(['上櫃', 'OTC', 'otc']);
        return {
            name: s.stock_name,
            market: otcTypes.has(s.type) ? 'otc' : 'tse',
        };
    } catch {
        return { name: null, market: 'tse' };
    }
};

// === 第 1 軌：盤中即時 (Cloudflare Worker → TWSE MIS) ===
const fetchMISRealtime = async (tickers) => {
    const results = new Map();
    if (tickers.length === 0) return results;

    // 依市場別組 ex_ch 字串，TWSE MIS 支援一次多檔用 | 分隔
    const exChList = tickers.map(t => {
        const { market } = getStockMeta(t);
        return `${market}_${t}.tw`;
    });

    // 一次最多 ~50 檔避免 URL 過長
    const BATCH = 50;
    for (let i = 0; i < exChList.length; i += BATCH) {
        const batch = exChList.slice(i, i + BATCH);
        const target = `${TWSE_MIS_URL}?ex_ch=${batch.join('|')}&_=${Date.now()}`;
        const proxyUrl = `${WORKER_URL}/?url=${encodeURIComponent(target)}`;
        try {
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;
            const data = await res.json();
            for (const item of data.msgArray || []) {
                const ticker = item.c;
                if (!ticker) continue;
                // z=即時成交價；若盤中無交易（z='-'）回退到最後揭示買價
                let price = parseNumber(item.z);
                if (isNaN(price) || price <= 0) {
                    const bid = (item.b || '').split('_')[0];
                    price = parseNumber(bid);
                }
                // 若還是沒有，退回昨收（總比沒有好）
                if (isNaN(price) || price <= 0) {
                    price = parseNumber(item.y);
                }
                if (!isNaN(price) && price > 0) {
                    results.set(ticker, { price, name: item.n });
                }
            }
        } catch (err) {
            console.warn('MIS proxy batch failed:', err.message);
        }
    }
    return results;
};

// === 第 2 軌：盤外當日收盤 (TWSE MI_INDEX 直連) ===
const fetchTWSEClose = async () => {
    if (twseTableCache && Date.now() - twseTableTime < TWSE_TABLE_TTL) {
        return twseTableCache;
    }
    const res = await fetch(TWSE_MI_INDEX_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
    const data = await res.json();
    const dailyTable = (data.tables || []).find(t => t.title && t.title.includes('每日收盤行情'));
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

// === 第 3 軌：FinMind fallback (上櫃/興櫃/其他) ===
const getStartDate = () => new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

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

// === 對外單一入口 ===
export const getTaiwanStockInfo = async (ticker) => {
    const cached = getCached(ticker);
    if (cached) return { price: cached.price, symbol: ticker, name: cached.name };

    await ensureStockList();
    const meta = getStockMeta(ticker);
    const fallbackName = meta.name || `台股 ${ticker}`;

    // 盤中走 MIS 即時
    if (isMarketOpen()) {
        try {
            const misMap = await fetchMISRealtime([ticker]);
            const hit = misMap.get(ticker);
            if (hit) {
                const name = hit.name || fallbackName;
                priceCache.set(ticker, { price: hit.price, name, time: Date.now() });
                return { price: hit.price, symbol: ticker, name };
            }
        } catch (err) {
            console.warn('MIS 即時失敗，改走收盤:', err.message);
        }
    }

    // 非盤中或 MIS 查無 → TWSE 當日收盤
    try {
        const closeMap = await fetchTWSEClose();
        const hit = closeMap.get(ticker);
        if (hit) {
            const name = hit.name || fallbackName;
            priceCache.set(ticker, { price: hit.price, name, time: Date.now() });
            return { price: hit.price, symbol: ticker, name };
        }
    } catch (err) {
        console.warn('TWSE 收盤查詢失敗:', err.message);
    }

    // 最後 fallback → FinMind
    try {
        const price = await fetchFinMindPrice(ticker);
        priceCache.set(ticker, { price, name: fallbackName, time: Date.now() });
        return { price, symbol: ticker, name: fallbackName };
    } catch (err) {
        throw new Error(`查無 ${ticker} 報價：${err.message}`);
    }
};

export const batchGetStockPrices = async (tickers, onProgress) => {
    await ensureStockList();

    const results = new Map();
    let completed = 0;

    // 1. 先處理 cache
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

    const marketOpen = isMarketOpen();
    const stillMissing = [];

    // 2. 盤中：批次打 MIS 透過 Worker 拿即時盤中價
    if (marketOpen) {
        try {
            const misMap = await fetchMISRealtime(uncached);
            for (const t of uncached) {
                const hit = misMap.get(t);
                if (hit) {
                    const name = hit.name || getStockMeta(t).name || `台股 ${t}`;
                    priceCache.set(t, { price: hit.price, name, time: Date.now() });
                    results.set(t, { success: true, price: hit.price, name, symbol: t });
                    completed++;
                } else {
                    stillMissing.push(t);
                }
            }
            onProgress?.(completed, tickers.length);
        } catch (err) {
            console.warn('MIS 批次失敗，全退回收盤:', err.message);
            stillMissing.push(...uncached);
        }
    } else {
        // 盤外：直接走 TWSE 當日收盤
        stillMissing.push(...uncached);
    }

    if (stillMissing.length === 0) return results;

    // 3. TWSE MI_INDEX 當日收盤（上市）
    let twseMap = null;
    try {
        twseMap = await fetchTWSEClose();
    } catch (err) {
        console.warn('TWSE MI_INDEX 失敗:', err.message);
    }

    const finmindQueue = [];
    for (const t of stillMissing) {
        if (twseMap && twseMap.has(t)) {
            const hit = twseMap.get(t);
            const name = hit.name || getStockMeta(t).name || `台股 ${t}`;
            priceCache.set(t, { price: hit.price, name, time: Date.now() });
            results.set(t, { success: true, price: hit.price, name, symbol: t });
            completed++;
        } else {
            finmindQueue.push(t);
        }
    }
    onProgress?.(completed, tickers.length);

    if (finmindQueue.length === 0) return results;

    // 4. 剩下（上櫃/興櫃或 TWSE 無資料）→ FinMind 並行
    const CONCURRENCY = 8;
    const worker = async (ticker) => {
        try {
            const price = await fetchFinMindPrice(ticker, 10000);
            const name = getStockMeta(ticker).name || `台股 ${ticker}`;
            priceCache.set(ticker, { price, name, time: Date.now() });
            results.set(ticker, { success: true, price, name, symbol: ticker });
        } catch (err) {
            results.set(ticker, { success: false, error: err.message });
        } finally {
            completed++;
            onProgress?.(completed, tickers.length);
        }
    };

    for (let i = 0; i < finmindQueue.length; i += CONCURRENCY) {
        const batch = finmindQueue.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(worker));
    }

    return results;
};
