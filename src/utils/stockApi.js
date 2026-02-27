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
        // 方法 A: FinMind API (免註冊，但興櫃等部分股票可能沒有最近日資料)
        let currentPrice = null;

        try {
            const d = new Date();
            d.setDate(d.getDate() - 10); // 拉長到 10 天，確保能抓到最近的交易日
            const dateStr = d.toISOString().split('T')[0];
            const priceUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${ticker}&start_date=${dateStr}`;

            const priceRes = await fetch(priceUrl);
            if (priceRes.ok) {
                const priceData = await priceRes.json();
                if (priceData.data && priceData.data.length > 0) {
                    const latestRecord = priceData.data[priceData.data.length - 1];
                    currentPrice = latestRecord.close;
                }
            }
        } catch (e) {
            console.warn("FinMind price fetch failed", e);
        }

        // 若方法 A 失敗（例如某些興櫃股票），前端網頁環境受限於 CORS 真的很難完美支援所有外站 API
        // 為了不再跳出紅色錯誤，這裡改為：如果真的抓不到，就不覆寫價格，讓這筆回傳 "需要手動更新"
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
