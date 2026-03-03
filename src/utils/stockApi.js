// src/utils/stockApi.js

/**
 * 取得台股資訊 (整合多資料來源以提高成功率)
 * - 優先使用 FinMind API (速度快，適合上市櫃大部份股票)
 * - 若查詢失敗或查無即時資料，可嘗試其他備援方案 (暫時回傳舊資料或提示使用者)
 */

export const getTaiwanStockInfo = async (ticker) => {
    try {
        // 1. 取得股票名稱與清單
        let stockName = null;
        try {
            let stockInfoList = JSON.parse(localStorage.getItem('tw_stock_info'));

            if (!stockInfoList) {
                const infoRes = await fetch('https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo');
                const infoData = await infoRes.json();
                if (infoData.data) {
                    stockInfoList = infoData.data;
                    localStorage.setItem('tw_stock_info', JSON.stringify(stockInfoList));
                }
            }

            if (stockInfoList) {
                const stock = stockInfoList.find(s => s.stock_id === ticker);
                if (stock) {
                    stockName = stock.stock_name;
                }
            }
        } catch (nameError) {
            console.warn("取得股票名稱失敗，忽略:", nameError);
        }

        // 2. 嘗試取得即時/近期股價
        // 改用 Yahoo Finance API 搭配 allorigins proxy 來解決 CORS 與資料延遲問題
        let currentPrice = null;

        // 建立 fetch Yahoo API 的 helper function，加入簡單重試機制
        const fetchYahooPrice = async (symbolSuffix, retries = 2) => {
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}${symbolSuffix}?interval=1d&range=1d`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`;

            for (let i = 0; i <= retries; i++) {
                try {
                    const res = await fetch(proxyUrl);
                    if (!res.ok) {
                        if (res.status >= 500 && i < retries) {
                            // Proxy 偶發 500/520 錯誤，等待半秒後重試
                            await new Promise(r => setTimeout(r, 500));
                            continue;
                        }
                        throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    const data = await res.json();

                    if (data.chart?.error) {
                        throw new Error(data.chart.error.description || 'Not found');
                    }

                    if (data.chart?.result?.[0]?.meta) {
                        return data.chart.result[0].meta.regularMarketPrice;
                    }
                    throw new Error('Invalid data format');
                } catch (error) {
                    if (i === retries || error.message.includes('Not found') || error.message.includes('No data found')) {
                        throw error;
                    }
                    // 其他網路錯誤重試
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        };

        try {
            // 先嘗試當作上市股票 (.TW)
            currentPrice = await fetchYahooPrice('.TW');
        } catch (e1) {
            console.log(`[${ticker}] 上市查詢失敗，嘗試上櫃查詢...`, e1.message);
            try {
                // 若失敗，嘗試當作上櫃股票 (.TWO)
                currentPrice = await fetchYahooPrice('.TWO');
            } catch (e2) {
                console.warn(`[${ticker}] 上櫃查詢也失敗:`, e2.message);
            }
        }

        if (currentPrice === null) {
            throw new Error(`公開 API 查無代碼 ${ticker} 的近期交易資料，可能為興櫃或暫無報價`);
        }

        return {
            price: currentPrice,
            symbol: ticker,
            name: stockName || `台股 ${ticker}` // 確保即使沒抓到中文名字，也給一個代號
        };

    } catch (error) {
        console.error("抓取股票資訊失敗:", error);
        throw error;
    }
};
