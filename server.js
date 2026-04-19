const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4184);

if (process.env.HAGIBIS_ENV_FILE) loadEnvFile(process.env.HAGIBIS_ENV_FILE);
loadEnvFile(path.join(ROOT, ".env.local"));

const CONFIG = {
  theNewsApiToken: process.env.THE_NEWS_API_TOKEN || "",
  marketAuxApiToken: process.env.MARKETAUX_API_TOKEN || "",
  finnhubApiKey: process.env.FINNHUB_API_KEY || "",
};

const COINGECKO_REST_ROOT = "https://api.coingecko.com/api/v3";
const FINNHUB_REST_ROOT = "https://finnhub.io/api/v1";
const YAHOO_CHART_ROOT = "https://query1.finance.yahoo.com/v8/finance/chart";
const MARKETAUX_REST_ROOT = "https://api.marketaux.com/v1";
const COINGECKO_HEADERS = {
  "User-Agent": "HagibisDashboard/1.0 (contact: local-app-shell)",
  "Accept": "application/json",
};
const DASHBOARD_TICKER_LIMIT = 7;
const CRYPTO_QUOTE_CACHE_TTL_MS = 20 * 1000;
const COINGECKO_ASSET_MAP = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  DOGE: "dogecoin",
  XRP: "ripple",
  ADA: "cardano",
};
const CRYPTO_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const cryptoHistoryCache = new Map();
const cryptoQuoteCache = new Map();

const STATIC_MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const DEMO_MARKET_LIBRARY = {
  BTC: { symbol: "BTC", assetType: "crypto", price: "$72.4K", change24h: "+3.8%", bars24h: [22, 24, 26, 28, 30, 32, 34, 36, 39, 42, 45, 48, 46, 44, 42, 40, 38, 41, 44, 48, 52, 55, 57, 58] },
  ETH: { symbol: "ETH", assetType: "crypto", price: "$3.6K", change24h: "+1.4%", bars24h: [18, 19, 20, 22, 24, 26, 28, 30, 33, 36, 40, 44, 46, 45, 43, 40, 37, 35, 36, 38, 41, 45, 49, 52] },
  SOL: { symbol: "SOL", assetType: "crypto", price: "$184", change24h: "-0.8%", bars24h: [48, 46, 44, 42, 40, 38, 35, 32, 30, 28, 25, 22, 20, 18, 19, 21, 23, 24, 26, 28, 30, 32, 34, 36] },
  BNB: { symbol: "BNB", assetType: "crypto", price: "$612", change24h: "+0.9%", bars24h: [18, 19, 20, 22, 23, 24, 26, 28, 30, 31, 33, 35, 37, 39, 40, 41, 43, 44, 46, 48, 50, 52, 53, 54] },
  DOGE: { symbol: "DOGE", assetType: "crypto", price: "$0.1842", change24h: "+2.7%", bars24h: [18, 18, 19, 20, 22, 24, 27, 30, 34, 38, 42, 46, 49, 47, 44, 40, 36, 33, 35, 39, 44, 49, 53, 56] },
  XRP: { symbol: "XRP", assetType: "crypto", price: "$0.6842", change24h: "+1.2%", bars24h: [20, 21, 22, 23, 24, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 41, 40, 39, 40, 42, 44, 46, 47, 48] },
  ADA: { symbol: "ADA", assetType: "crypto", price: "$0.7420", change24h: "-0.4%", bars24h: [44, 43, 42, 41, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 19, 20, 22, 24, 26, 27, 28, 29] },
  AAPL: { symbol: "AAPL", assetType: "stock", price: "$175", change24h: "+0.7%", bars24h: [18, 19, 20, 20, 21, 23, 24, 25, 26, 28, 30, 31, 31, 32, 33, 34, 35, 37, 38, 40, 42, 43, 44, 45] },
  NVDA: { symbol: "NVDA", assetType: "stock", price: "$948", change24h: "+2.1%", bars24h: [16, 18, 20, 22, 24, 26, 28, 31, 33, 34, 36, 37, 39, 41, 43, 44, 46, 49, 52, 54, 56, 58, 60, 62] },
  MSFT: { symbol: "MSFT", assetType: "stock", price: "$421", change24h: "+0.5%", bars24h: [21, 22, 22, 23, 24, 24, 25, 26, 27, 28, 29, 29, 30, 31, 33, 34, 35, 35, 36, 37, 38, 39, 40, 41] },
  TSLA: { symbol: "TSLA", assetType: "stock", price: "$184", change24h: "-0.8%", bars24h: [52, 50, 49, 47, 45, 43, 41, 38, 35, 32, 30, 28, 26, 25, 24, 23, 24, 25, 26, 28, 30, 31, 32, 34] },
  AMZN: { symbol: "AMZN", assetType: "stock", price: "$186", change24h: "+0.4%", bars24h: [18, 18, 19, 20, 21, 22, 22, 23, 24, 24, 25, 26, 27, 28, 29, 29, 30, 31, 32, 32, 33, 34, 35, 36] },
  META: { symbol: "META", assetType: "stock", price: "$503", change24h: "+1.1%", bars24h: [20, 22, 23, 25, 26, 28, 29, 31, 32, 33, 35, 36, 37, 39, 40, 42, 43, 44, 46, 47, 49, 50, 52, 54] },
  SPY: { symbol: "SPY", assetType: "stock", price: "$612", change24h: "+0.4%", bars24h: [24, 24, 25, 25, 26, 26, 27, 28, 28, 29, 29, 30, 31, 32, 32, 33, 33, 34, 35, 35, 36, 37, 38, 39] },
  QQQ: { symbol: "QQQ", assetType: "stock", price: "$528", change24h: "+0.6%", bars24h: [19, 20, 20, 21, 22, 23, 24, 24, 25, 26, 27, 28, 29, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40] },
};

const DEMO_NEWS = {
  headline: "Add MARKETAUX_API_TOKEN or THE_NEWS_API_TOKEN to load live headlines.",
  subline: "The shell prefers MarketAux for ticker-aware briefing and falls back to The News API.",
  ageLabel: "News provider unconfigured",
  source: "MarketAux / The News API",
  status: "demo",
};

const DEMO_NEWS_ITEMS = [
  {
    headline: "Add MARKETAUX_API_TOKEN or THE_NEWS_API_TOKEN to load live headlines.",
    subline: "The shell prefers MarketAux for ticker-aware briefing and falls back to The News API.",
    ageLabel: "Demo feed",
    source: "MarketAux / The News API",
    url: "",
    status: "demo",
  },
  {
    headline: "One request can supply three AI headlines without increasing request count.",
    subline: "The list layout is optimized for small-screen scanning.",
    ageLabel: "Usage saver",
    source: "Local shell",
    url: "",
    status: "demo",
  },
  {
    headline: "Compact rows beat one oversized headline on a 3.5-inch display.",
    subline: "This layout preserves spacing and hierarchy.",
    ageLabel: "Hagibis safe",
    source: "Local shell",
    url: "",
    status: "demo",
  },
];

const DEMO_SENTIMENT = {
  label: "Crypto Fear & Greed",
  source: "Alternative.me demo",
  value: 68,
  classification: "Greed",
  status: "demo",
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 10);
}

function json(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function send404(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    send404(res);
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      send404(res);
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": STATIC_MIME[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(buffer);
  });
}

function requestJson(input, options = {}) {
  const parsed = new URL(input);
  const transport = parsed.protocol === "http:" ? http : https;
  const headers = options.headers || {};

  return new Promise((resolve, reject) => {
    const req = transport.request(parsed, { method: "GET", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Request failed with ${res.statusCode}: ${body.slice(0, 180)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(12000, () => {
      req.destroy(new Error("Request timed out"));
    });
    req.end();
  });
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  if (Math.abs(value) >= 100) {
    return `$${value.toFixed(0)}`;
  }
  if (Math.abs(value) >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(4)}`;
}

function formatChange(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function scaleBars(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return [18, 24, 30, 36];

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  if (min === max) return numeric.map(() => 34);

  return numeric.map((value) => {
    const ratio = (value - min) / (max - min);
    return Math.round(18 + ratio * 40);
  });
}

function relativeAge(dateString) {
  const timestamp = Date.parse(dateString);
  if (!Number.isFinite(timestamp)) return "Just now";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "Just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().slice(0, 19);
}

function fallbackMarketItem(symbol, status = "demo") {
  const demo = DEMO_MARKET_LIBRARY[symbol];
  const assetType = demo?.assetType || (isCryptoTicker(symbol) ? "crypto" : "stock");

  if (status !== "demo") {
    return {
      symbol,
      assetType,
      price: "—",
      change24h: "—",
      bars24h: assetType === "stock" ? [18, 22, 26, 30, 34, 30, 26, 22] : [18, 24, 30, 36],
      status,
    };
  }

  return demo || {
    symbol,
    assetType,
    price: "—",
    change24h: "—",
    bars24h: assetType === "stock" ? [18, 22, 26, 30, 34, 30, 26, 22] : [18, 24, 30, 36],
    status,
  };
}

function isCryptoTicker(symbol) {
  return Boolean(COINGECKO_ASSET_MAP[symbol]);
}

function getCoinGeckoAssetId(symbol) {
  return COINGECKO_ASSET_MAP[symbol];
}

async function getCoinGeckoHistoryBars(assetId) {
  const cached = cryptoHistoryCache.get(assetId);
  if (cached && Date.now() - cached.fetchedAt < CRYPTO_HISTORY_CACHE_TTL_MS) {
    return cached.bars;
  }

  const endpoint = new URL(`${COINGECKO_REST_ROOT}/coins/${assetId}/market_chart`);
  endpoint.searchParams.set("vs_currency", "usd");
  endpoint.searchParams.set("days", "1");
  endpoint.searchParams.set("interval", "hourly");

  try {
    const historyResponse = await requestJson(endpoint.toString(), {
      headers: COINGECKO_HEADERS,
    });
    const closes = Array.isArray(historyResponse?.prices)
      ? historyResponse.prices
          .map((point) => Number(Array.isArray(point) ? point[1] : NaN))
          .filter((value) => Number.isFinite(value))
      : [];
    const bars = closes.length ? scaleBars(closes) : [18, 24, 30, 36];
    cryptoHistoryCache.set(assetId, { bars, fetchedAt: Date.now() });
    return bars;
  } catch (error) {
    console.warn(`Failed to load CoinGecko history for ${assetId}`, error.message);
    return [18, 24, 30, 36];
  }
}

async function fetchCoinGeckoMarketItems(symbols) {
  const cryptoSymbols = [...new Set(symbols.filter(isCryptoTicker))];
  if (!cryptoSymbols.length) return [];
  const cacheKey = cryptoSymbols.slice().sort().join(",");
  const cached = cryptoQuoteCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CRYPTO_QUOTE_CACHE_TTL_MS) {
    return cached.items;
  }

  const ids = cryptoSymbols
    .map(getCoinGeckoAssetId)
    .filter(Boolean);
  const endpoint = new URL(`${COINGECKO_REST_ROOT}/simple/price`);
  endpoint.searchParams.set("ids", ids.join(","));
  endpoint.searchParams.set("vs_currencies", "usd");
  endpoint.searchParams.set("include_24hr_change", "true");

  try {
    const priceResponse = await requestJson(endpoint.toString(), {
      headers: COINGECKO_HEADERS,
    });
    const items = await Promise.all(cryptoSymbols.map(async (symbol) => {
      const assetId = getCoinGeckoAssetId(symbol);
      const snapshot = priceResponse?.[assetId];
      const latest = Number(snapshot?.usd);
      const change = Number(snapshot?.usd_24h_change);
      const bars24h = await getCoinGeckoHistoryBars(assetId);

      if (!Number.isFinite(latest)) {
        return fallbackMarketItem(symbol);
      }

      return {
        symbol,
        assetType: "crypto",
        price: formatPrice(latest),
        change24h: Number.isFinite(change) ? formatChange(change) : "—",
        bars24h,
        status: "live",
      };
    }));
    cryptoQuoteCache.set(cacheKey, {
      fetchedAt: Date.now(),
      items,
    });
    return items;
  } catch (error) {
    console.warn("Failed to load CoinGecko market data", error.message);
    if (cached?.items?.length) {
      return cached.items;
    }
    return cryptoSymbols.map((symbol) => fallbackMarketItem(symbol, "fallback"));
  }
}

async function fetchMarketItem(symbol) {
  if (CONFIG.finnhubApiKey) {
    return fetchFinnhubMarketItem(symbol);
  }
  return fetchYahooMarketItem(symbol);
}

function getFinnhubTokenizedUrl(pathname, params) {
  const endpoint = new URL(`${FINNHUB_REST_ROOT}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    endpoint.searchParams.set(key, String(value));
  });
  endpoint.searchParams.set("token", CONFIG.finnhubApiKey);
  return endpoint;
}

async function fetchFinnhubMarketItem(symbol) {
  if (!CONFIG.finnhubApiKey) {
    return fallbackMarketItem(symbol, "unconfigured");
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - 24 * 60 * 60;
  const quoteEndpoint = getFinnhubTokenizedUrl("/quote", { symbol });
  const candleEndpoint = getFinnhubTokenizedUrl("/stock/candle", {
    symbol,
    resolution: "60",
    from,
    to: now,
  });

  try {
    const quoteResponse = await requestJson(quoteEndpoint.toString());

    const latest = Number(quoteResponse?.c);
    const previousClose = Number(quoteResponse?.pc);
    const reportedPercentChange = Number(quoteResponse?.dp);

    if (!Number.isFinite(latest)) {
      return fallbackMarketItem(symbol, "fallback");
    }

    let closes = [];
    try {
      const candleResponse = await requestJson(candleEndpoint.toString());
      closes = Array.isArray(candleResponse?.c)
        ? candleResponse.c.map((value) => Number(value)).filter((value) => Number.isFinite(value)).slice(-24)
        : [];
    } catch (error) {
      console.warn(`Falling back to quote-only Finnhub data for ${symbol}`, error.message);
    }

    const change = Number.isFinite(reportedPercentChange)
      ? reportedPercentChange
      : Number.isFinite(previousClose) && previousClose !== 0
        ? ((latest - previousClose) / previousClose) * 100
        : NaN;

    return {
      symbol,
      assetType: "stock",
      price: formatPrice(latest),
      change24h: Number.isFinite(change) ? formatChange(change) : "—",
      bars24h: closes.length ? scaleBars(closes) : [18, 22, 26, 30, 34, 30, 26, 22],
      status: "live",
    };
  } catch (error) {
    console.warn(`Failed to load Finnhub market data for ${symbol}`, error.message);
    return fallbackMarketItem(symbol, "fallback");
  }
}

async function fetchYahooMarketItem(symbol) {
  const endpoint = new URL(`${YAHOO_CHART_ROOT}/${encodeURIComponent(symbol)}`);
  endpoint.searchParams.set("range", "5d");
  endpoint.searchParams.set("interval", "1h");
  endpoint.searchParams.set("includePrePost", "false");
  endpoint.searchParams.set("events", "div,splits");

  try {
    const response = await requestJson(endpoint.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
      },
    });
    const result = Array.isArray(response?.chart?.result) ? response.chart.result[0] : null;
    const meta = result?.meta || {};
    const quote = result?.indicators?.quote?.[0] || {};
    const closes = Array.isArray(quote.close)
      ? quote.close.map((value) => Number(value)).filter((value) => Number.isFinite(value)).slice(-24)
      : [];

    const latest = Number(meta.regularMarketPrice ?? closes.at(-1));
    const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);

    if (!Number.isFinite(latest)) {
      return fallbackMarketItem(symbol, "fallback");
    }

    const change = Number.isFinite(previousClose) && previousClose !== 0
      ? ((latest - previousClose) / previousClose) * 100
      : NaN;

    return {
      symbol,
      assetType: "stock",
      price: formatPrice(latest),
      change24h: Number.isFinite(change) ? formatChange(change) : "—",
      bars24h: closes.length ? scaleBars(closes) : [18, 24, 30, 36],
      status: "live",
    };
  } catch (error) {
    console.warn(`Failed to load Yahoo market data for ${symbol}`, error.message);
    return fallbackMarketItem(symbol, "fallback");
  }
}

async function getMarketItems(tickers) {
  const cryptoSymbols = tickers.filter(isCryptoTicker);
  const stockSymbols = tickers.filter((symbol) => !isCryptoTicker(symbol));
  const [cryptoItems, stockItems] = await Promise.all([
    fetchCoinGeckoMarketItems(cryptoSymbols),
    Promise.all(stockSymbols.map(fetchMarketItem)),
  ]);
  const itemMap = new Map([...cryptoItems, ...stockItems].map((item) => [item.symbol, item]));
  const items = tickers.map((symbol) => itemMap.get(symbol) || fallbackMarketItem(symbol));
  return {
    status: items.every((item) => item.status === "live")
      ? "live"
      : items.some((item) => item.status === "live")
        ? "mixed"
        : items.some((item) => item.status === "unconfigured")
          ? "unconfigured"
          : "demo",
    items,
  };
}

function buildNewsSubline(article) {
  const raw = article?.snippet || article?.description || "";
  if (!raw) return "Live AI headlines ready for the brief panel.";
  return raw.replace(/\s+/g, " ").trim().slice(0, 78);
}

async function getNewsBrief() {
  return getNewsBriefForTickers([]);
}

function normalizeNewsTickerSet(tickers = []) {
  return tickers
    .map(normalizeTicker)
    .filter(Boolean)
    .slice(0, 6);
}

function formatNewsSource(article) {
  return article?.source || article?.source_domain || article?.domain || "MarketAux";
}

async function getMarketAuxNews(tickers = []) {
  if (!CONFIG.marketAuxApiToken) return null;

  const symbols = normalizeNewsTickerSet(tickers);
  const endpoint = new URL(`${MARKETAUX_REST_ROOT}/news/all`);
  endpoint.searchParams.set("api_token", CONFIG.marketAuxApiToken);
  endpoint.searchParams.set("language", "en");
  endpoint.searchParams.set("limit", "3");
  endpoint.searchParams.set("filter_entities", "true");
  endpoint.searchParams.set("must_have_entities", "true");
  endpoint.searchParams.set("published_after", isoHoursAgo(72));
  if (symbols.length) {
    endpoint.searchParams.set("symbols", symbols.join(","));
  }

  try {
    const response = await requestJson(endpoint.toString());
    const items = Array.isArray(response?.data)
      ? response.data
          .slice(0, 3)
          .map((article) => ({
            headline: article.title || "Latest market headline",
            subline: buildNewsSubline(article),
            ageLabel: relativeAge(article.published_at),
            source: formatNewsSource(article),
            url: article.url || "",
            status: "live",
          }))
      : [];

    if (!items.length) return null;

    return {
      status: "live",
      providerName: "MarketAux",
      items,
      primary: items[0],
    };
  } catch (error) {
    console.warn("Failed to load MarketAux news", error.message);
    return null;
  }
}

async function getTheNewsApiBrief() {
  if (!CONFIG.theNewsApiToken) return null;

  const endpoint = new URL("https://api.thenewsapi.com/v1/news/all");
  endpoint.searchParams.set("api_token", CONFIG.theNewsApiToken);
  endpoint.searchParams.set("categories", "tech,business,science");
  endpoint.searchParams.set("language", "en");
  endpoint.searchParams.set("locale", "us,gb,ca,au,sg,in");
  endpoint.searchParams.set("limit", "6");
  endpoint.searchParams.set("published_after", isoHoursAgo(168));
  endpoint.searchParams.set("search", "(AI | OpenAI | Anthropic | Nvidia | Gemini | Claude | LLM | model)");
  endpoint.searchParams.set("search_fields", "title,description,keywords,main_text");
  endpoint.searchParams.set("sort", "published_at");

  try {
    const response = await requestJson(endpoint.toString());
    const items = Array.isArray(response.data)
      ? response.data
          .filter((entry) => {
            const publishedAt = Date.parse(entry?.published_at || "");
            return Number.isFinite(publishedAt) && Date.now() - publishedAt <= 7 * 24 * 60 * 60 * 1000;
          })
          .slice(0, 3)
          .map((article) => ({
            headline: article.title || "Latest AI story",
            subline: buildNewsSubline(article),
            ageLabel: relativeAge(article.published_at),
            source: article.source || "The News API",
            url: article.url || article.source_url || "",
            status: "live",
          }))
      : [];

    if (!items.length) {
      return null;
    }

    return {
      status: "live",
      providerName: "The News API",
      items,
      primary: items[0],
    };
  } catch (error) {
    console.warn("Failed to load AI news", error.message);
    return null;
  }
}

async function getNewsBriefForTickers(tickers = []) {
  const marketAux = await getMarketAuxNews(tickers);
  if (marketAux) return marketAux;

  const theNewsApi = await getTheNewsApiBrief();
  if (theNewsApi) return theNewsApi;

  return {
    status: "demo",
    providerName: "MarketAux / The News API",
    items: DEMO_NEWS_ITEMS,
    primary: DEMO_NEWS_ITEMS[0],
  };
}

async function getSentiment() {
  try {
    const response = await requestJson("https://api.alternative.me/fng/?limit=1");
    const latest = Array.isArray(response.data) ? response.data[0] : null;
    if (!latest) return DEMO_SENTIMENT;

    return {
      label: "Crypto Fear & Greed",
      source: "Alternative.me",
      value: Number(latest.value),
      classification: latest.value_classification || "Neutral",
      status: "live",
    };
  } catch (error) {
    console.warn("Failed to load sentiment", error.message);
    return DEMO_SENTIMENT;
  }
}

function normalizeRequestedTickers(url) {
  const value = url.searchParams.get("tickers") || "";
  const tickers = value
    .split(",")
    .map(normalizeTicker)
    .filter(Boolean)
    .slice(0, DASHBOARD_TICKER_LIMIT);
  return tickers.length ? tickers : ["BTC", "ETH", "SOL", "DOGE", "XRP", "BNB", "ADA"];
}

function combineMode(...statuses) {
  if (statuses.every((status) => status === "live")) return "live";
  if (statuses.some((status) => status === "live")) return "mixed";
  return "demo";
}

async function buildDashboardPayload(url) {
  const tickers = normalizeRequestedTickers(url);
  const market = await getMarketItems(tickers);
  const newsBrief = await getNewsBriefForTickers(tickers);
  const sentiment = await getSentiment();

  return {
    fetchedAt: new Date().toISOString(),
    fetchedAtLabel: "Just updated",
    dataMode: combineMode(market.status, newsBrief.status, sentiment.status),
    providers: {
      market: {
        name: "CoinGecko / Finnhub",
        status: market.status,
      },
      news: {
        name: newsBrief.providerName,
        status: newsBrief.status,
      },
      sentiment: {
        name: "Alternative.me",
        status: sentiment.status,
      },
    },
    marketItems: market.items,
    newsBrief: newsBrief.primary,
    newsItems: newsBrief.items,
    sentiment,
  };
}

async function buildMarketPayload(url) {
  const tickers = normalizeRequestedTickers(url);
  const market = await getMarketItems(tickers);

  return {
    fetchedAt: new Date().toISOString(),
    fetchedAtLabel: "Just updated",
    provider: {
      name: CONFIG.finnhubApiKey ? "CoinGecko / Finnhub" : "CoinGecko / Yahoo Finance",
      status: market.status,
    },
    marketItems: market.items,
  };
}

async function buildNewsPayload(url) {
  const tickers = normalizeRequestedTickers(url);
  const newsBrief = await getNewsBriefForTickers(tickers);

  return {
    fetchedAt: new Date().toISOString(),
    fetchedAtLabel: "Just updated",
    provider: {
      name: newsBrief.providerName,
      status: newsBrief.status,
    },
    newsBrief: newsBrief.primary,
    newsItems: newsBrief.items,
  };
}

async function buildSentimentPayload() {
  const sentiment = await getSentiment();

  return {
    fetchedAt: new Date().toISOString(),
    fetchedAtLabel: "Just updated",
    provider: {
      name: "Alternative.me",
      status: sentiment.status,
    },
    sentiment,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (url.pathname === "/api/market") {
    try {
      const payload = await buildMarketPayload(url);
      json(res, 200, payload);
    } catch (error) {
      json(res, 500, {
        error: "market_unavailable",
        message: error.message,
      });
    }
    return;
  }

  if (url.pathname === "/api/news") {
    try {
      const payload = await buildNewsPayload(url);
      json(res, 200, payload);
    } catch (error) {
      json(res, 500, {
        error: "news_unavailable",
        message: error.message,
      });
    }
    return;
  }

  if (url.pathname === "/api/sentiment") {
    try {
      const payload = await buildSentimentPayload();
      json(res, 200, payload);
    } catch (error) {
      json(res, 500, {
        error: "sentiment_unavailable",
        message: error.message,
      });
    }
    return;
  }

  if (url.pathname === "/api/dashboard") {
    try {
      const payload = await buildDashboardPayload(url);
      json(res, 200, payload);
    } catch (error) {
      json(res, 500, {
        error: "dashboard_unavailable",
        message: error.message,
      });
    }
    return;
  }

  if (url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      marketProviderConfigured: true,
      cryptoMarketProviderConfigured: true,
      stockMarketProviderConfigured: true,
      newsProviderConfigured: Boolean(CONFIG.marketAuxApiToken || CONFIG.theNewsApiToken),
    });
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Hagibis app shell server listening on http://127.0.0.1:${PORT}`);
});
