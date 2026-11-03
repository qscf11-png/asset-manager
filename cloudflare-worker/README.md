# Cloudflare Worker 部署指引

這個 Worker 是 Asset Manager app 的專用 CORS proxy，用來打 TWSE / TPEX 的即時盤中報價 API（這些 API 本身沒有 CORS header 擋瀏覽器直連）。

**為什麼需要**：
- 盤中（09:00–13:30）TWSE MI_INDEX 只給昨日收盤，想拿即時盤中價必須走 TWSE MIS API
- TWSE MIS API 沒設 `Access-Control-Allow-Origin`，瀏覽器直連會被擋
- 公用 CORS proxy（corsproxy.io 等）常掛，不穩定
- 自架 Worker：免費、穩定、無限制

**免費額度**：Cloudflare Workers 免費方案每天 10 萬次請求，用這個 app 綽綽有餘。

---

## 部署步驟（約 5 分鐘）

### 1. 註冊 Cloudflare

- 到 https://dash.cloudflare.com/sign-up 用 email 註冊（免費方案即可，**不需要信用卡**）
- 收驗證信啟用

### 2. 建立 Worker

- 登入後，左側選單選 **"Workers & Pages"**
- 點 **"Create application"** → 選 **"Create Worker"**
- 名字隨便取，建議 `asset-stock-proxy`
- 點 **"Deploy"**（會先用預設的 "Hello World" 腳本）

### 3. 貼入我寫好的腳本

- 部署完成後點 **"Edit code"**（右上角）
- 把編輯器裡的預設 code 全選刪除
- 複製貼上 [worker.js](worker.js) 的全部內容
- 點右上 **"Save and Deploy"**

### 4. 拿到 Worker URL

- 回到 Worker 概覽頁，上方會顯示：
  ```
  https://asset-stock-proxy.<你的帳號>.workers.dev
  ```
- 這就是你的 Worker URL，**複製下來給 Claude**

### 5. 測試 Worker 是否正常

打開瀏覽器貼網址（把 `<你的帳號>` 換成實際值）：

```
https://asset-stock-proxy.<你的帳號>.workers.dev/?url=https%3A%2F%2Fmis.twse.com.tw%2Fstock%2Fapi%2FgetStockInfo.jsp%3Fex_ch%3Dtse_2330.tw
```

正常應該看到 TWSE 回傳的 JSON（包含 `msgArray`、`台積電` 等欄位）。

---

## 完成後給 Claude

把你的 Worker URL 貼給 Claude，像這樣：

> 我的 Worker 已經部署好，URL 是 https://asset-stock-proxy.xxxx.workers.dev

Claude 會接著把 URL 寫進 app 的 stockApi.js，之後：
- **盤中 (09:00–13:30 台北)**：透過 Worker 走 TWSE MIS 拿即時盤中價（15 秒延遲）
- **盤後**：直接走 TWSE MI_INDEX 當日收盤（不需 proxy）

---

## 安全性

Worker 的白名單只允許轉發到：
- `mis.twse.com.tw` / `www.twse.com.tw`（上市）
- `www.tpex.org.tw` / `mis.tpex.org.tw`（上櫃／興櫃）
- `api.finmindtrade.com`（日線歷史 fallback）

其他網址一律 403，不會被濫用成通用 proxy。

Origin 白名單只放行你的 GitHub Pages 和本機開發 server，別人把 URL 貼到自己網站用不了。
