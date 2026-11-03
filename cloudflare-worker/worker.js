// Cloudflare Worker — Asset Manager 專用的 CORS proxy
// 僅轉發到白名單上的台股資料來源，避免被濫用成通用 proxy
//
// 用法: GET https://<你的worker>.workers.dev/?url=<目標URL>
// 例  : .../?url=https%3A%2F%2Fmis.twse.com.tw%2Fstock%2Fapi%2FgetStockInfo.jsp%3Fex_ch%3Dtse_2330.tw

const ALLOWED_HOSTS = new Set([
    'mis.twse.com.tw',       // 即時盤中報價
    'www.twse.com.tw',       // 當日收盤行情
    'www.tpex.org.tw',       // 上櫃／興櫃
    'mis.tpex.org.tw',       // 上櫃即時盤中
    'api.finmindtrade.com',  // 日線歷史 fallback
]);

const ALLOWED_ORIGINS = new Set([
    'https://qscf11-png.github.io',
    'http://localhost:5173',
    'http://localhost:4173',
]);

function corsHeaders(origin) {
    const h = {
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
    // 僅允許已知的 Origin，若 origin 不在白名單仍然放行 * 以利 debug
    h['Access-Control-Allow-Origin'] = ALLOWED_ORIGINS.has(origin) ? origin : '*';
    return h;
}

export default {
    async fetch(request) {
        const origin = request.headers.get('Origin') || '';

        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        if (request.method !== 'GET') {
            return new Response('Only GET allowed', { status: 405, headers: corsHeaders(origin) });
        }

        const url = new URL(request.url);
        const target = url.searchParams.get('url');
        if (!target) {
            return new Response('Missing ?url= param', { status: 400, headers: corsHeaders(origin) });
        }

        let targetUrl;
        try {
            targetUrl = new URL(target);
        } catch {
            return new Response('Invalid url', { status: 400, headers: corsHeaders(origin) });
        }

        if (!ALLOWED_HOSTS.has(targetUrl.host)) {
            return new Response(`Host ${targetUrl.host} not allowed`, {
                status: 403,
                headers: corsHeaders(origin),
            });
        }

        try {
            const upstream = await fetch(targetUrl.toString(), {
                headers: {
                    // 模擬瀏覽器 UA — TWSE MIS 若無 UA 會被擋
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                    'Referer': `https://${targetUrl.host}/`,
                },
                cf: {
                    // Cloudflare 邊緣快取 15 秒，降低對 TWSE 的壓力也加快回應
                    cacheTtl: 15,
                    cacheEverything: true,
                },
            });

            const body = await upstream.arrayBuffer();
            const headers = {
                ...corsHeaders(origin),
                'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=15',
            };

            return new Response(body, { status: upstream.status, headers });
        } catch (err) {
            return new Response(`Proxy fetch failed: ${err.message}`, {
                status: 502,
                headers: corsHeaders(origin),
            });
        }
    },
};
