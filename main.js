const STORAGE_KEY = "hagibis-shell-settings-v2";
const HERO_LIMIT = 3;
const WATCHLIST_LIMIT = 4;
const WATCHLIST_WINDOW_SIZE = 2;
const TOTAL_TICKER_LIMIT = HERO_LIMIT + WATCHLIST_LIMIT;
const HERO_ROTATION_INTERVAL_MS = 6000;
const WATCHLIST_ROTATION_INTERVAL_MS = 6000;
const NEWS_ROTATION_INTERVAL_MS = 8000;
const MARKET_REFRESH_INTERVAL_MS = 20 * 1000;
const NEWS_REFRESH_INTERVAL_MS = 20 * 60 * 1000;
const SENTIMENT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const MARKET_LIBRARY = {
  BTC: { symbol: "BTC", assetType: "crypto" },
  ETH: { symbol: "ETH", assetType: "crypto" },
  SOL: { symbol: "SOL", assetType: "crypto" },
  BNB: { symbol: "BNB", assetType: "crypto" },
  DOGE: { symbol: "DOGE", assetType: "crypto" },
  XRP: { symbol: "XRP", assetType: "crypto" },
  ADA: { symbol: "ADA", assetType: "crypto" },
  AAPL: { symbol: "AAPL", assetType: "stock" },
  NVDA: { symbol: "NVDA", assetType: "stock" },
  MSFT: { symbol: "MSFT", assetType: "stock" },
  TSLA: { symbol: "TSLA", assetType: "stock" },
  AMZN: { symbol: "AMZN", assetType: "stock" },
  META: { symbol: "META", assetType: "stock" },
  SPY: { symbol: "SPY", assetType: "stock" },
  QQQ: { symbol: "QQQ", assetType: "stock" },
};

const DEFAULT_HERO_TICKERS = ["BTC", "ETH", "SOL"];
const DEFAULT_WATCHLIST_TICKERS = ["DOGE", "XRP", "BNB", "ADA"];

const appState = {
  heroTickers: [...DEFAULT_HERO_TICKERS],
  watchlistTickers: [...DEFAULT_WATCHLIST_TICKERS],
  assignmentTarget: "watch",
  rotationEnabled: true,
  heroPage: 0,
  heroRotationTimer: null,
  watchlistPage: 0,
  watchlistRotationTimer: null,
  newsPage: 0,
  newsRotationTimer: null,
  marketRefreshTimer: null,
  newsRefreshTimer: null,
  sentimentRefreshTimer: null,
  resizeFrame: null,
  providerHealth: {
    stockMarketProviderConfigured: true,
    newsProviderConfigured: false,
  },
  dashboardPayload: null,
  dataStatus: "Loading data…",
};

const elements = {
  briefPanelInteractive: document.getElementById("briefPanel"),
  briefPanel: document.querySelector(".brief-panel"),
  briefStory: document.getElementById("briefStory"),
  heroSymbol: document.getElementById("heroSymbol"),
  heroValue: document.getElementById("heroValue"),
  heroPeriod: document.getElementById("heroPeriod"),
  heroChange: document.getElementById("heroChange"),
  heroBars: document.getElementById("heroBars"),
  heroWindowLabel: document.getElementById("heroWindowLabel"),
  watchlistRows: document.getElementById("watchlistRows"),
  watchlistWindowLabel: document.getElementById("watchlistWindowLabel"),
  briefTime: document.getElementById("briefTime"),
  briefIndex: document.getElementById("briefIndex"),
  briefHeadline: document.getElementById("briefHeadline"),
  briefSubline: document.getElementById("briefSubline"),
  sentimentLabel: document.getElementById("sentimentLabel"),
  sentimentSource: document.getElementById("sentimentSource"),
  sentimentValue: document.getElementById("sentimentValue"),
  sentimentClassification: document.getElementById("sentimentClassification"),
  gaugeFill: document.getElementById("gaugeFill"),
  statusCopy: document.getElementById("statusCopy"),
  libraryStatusCopy: document.getElementById("libraryStatusCopy"),
  assignHint: document.getElementById("assignHint"),
  assignHeroBtn: document.getElementById("assignHeroBtn"),
  assignWatchBtn: document.getElementById("assignWatchBtn"),
  assignCancelBtn: document.getElementById("assignCancelBtn"),
  openSettingsBtn: document.getElementById("openSettingsBtn"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  heroTickerList: document.getElementById("heroTickerList"),
  watchTickerList: document.getElementById("watchTickerList"),
  cryptoTickerLibrary: document.getElementById("cryptoTickerLibrary"),
  stockTickerLibrary: document.getElementById("stockTickerLibrary"),
  stockLibrarySection: document.getElementById("stockLibrarySection"),
  stockLibraryStatus: document.getElementById("stockLibraryStatus"),
  selectedCount: document.getElementById("selectedCount"),
  heroSelectionCount: document.getElementById("heroSelectionCount"),
  watchSelectionCount: document.getElementById("watchSelectionCount"),
  customTickerForm: document.getElementById("customTickerForm"),
  customTickerInput: document.getElementById("customTickerInput"),
  customTickerSubmit: document.getElementById("customTickerSubmit"),
  customTargetCopy: document.getElementById("customTargetCopy"),
  rotationToggle: document.getElementById("rotationToggle"),
};

function getSeriesTone(changeValue) {
  const value = String(changeValue || "");
  if (value.startsWith("+")) return "positive";
  if (value.startsWith("-")) return "negative";
  return "neutral";
}

function syncCanvasScale() {
  const viewportWidth = Math.max(window.innerWidth, 320);
  const viewportHeight = Math.max(window.innerHeight, 320);
  document.documentElement.style.setProperty("--canvas-width", `${viewportWidth}px`);
  document.documentElement.style.setProperty("--canvas-height", `${viewportHeight}px`);
}

function handleViewportResize() {
  syncCanvasScale();
  if (appState.resizeFrame) {
    window.cancelAnimationFrame(appState.resizeFrame);
  }
  appState.resizeFrame = window.requestAnimationFrame(() => {
    appState.resizeFrame = null;
    renderAll();
  });
}

function sanitizeTickerList(list, limit, excluded = new Set()) {
  if (!Array.isArray(list)) return [];
  const output = [];
  list.forEach((value) => {
    const ticker = normalizeTicker(value);
    if (!ticker) return;
    if (excluded.has(ticker)) return;
    excluded.add(ticker);
    if (output.length < limit) output.push(ticker);
  });
  return output;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const excluded = new Set();
    let heroTickers = sanitizeTickerList(parsed.heroTickers, HERO_LIMIT, excluded);
    let watchlistTickers = sanitizeTickerList(parsed.watchlistTickers, WATCHLIST_LIMIT, excluded);

    if (!heroTickers.length && !watchlistTickers.length && Array.isArray(parsed.selectedTickers)) {
      const legacy = sanitizeTickerList(parsed.selectedTickers, TOTAL_TICKER_LIMIT, new Set());
      heroTickers = legacy.slice(0, HERO_LIMIT);
      watchlistTickers = legacy.slice(HERO_LIMIT, TOTAL_TICKER_LIMIT);
    }

    appState.heroTickers = heroTickers.length ? heroTickers : [...DEFAULT_HERO_TICKERS];
    appState.watchlistTickers = watchlistTickers.length ? watchlistTickers : [...DEFAULT_WATCHLIST_TICKERS];
    if (typeof parsed.rotationEnabled === "boolean") {
      appState.rotationEnabled = parsed.rotationEnabled;
    }
  } catch (error) {
    console.warn("Failed to load Hagibis settings", error);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      heroTickers: appState.heroTickers,
      watchlistTickers: appState.watchlistTickers,
      rotationEnabled: appState.rotationEnabled,
    }),
  );
}

function normalizeTicker(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
  return normalized.slice(0, 10) || null;
}

function getFallbackTickerData(symbol) {
  const assetType = MARKET_LIBRARY[symbol]?.assetType || "stock";
  return {
    symbol,
    assetType,
    price: "—",
    change24h: "—",
    bars24h: [18, 24, 30, 36],
    status: "fallback",
  };
}

function ensureDashboardPayload() {
  if (!appState.dashboardPayload) {
    appState.dashboardPayload = {
      providers: {
        market: { name: "CoinGecko", status: "demo" },
        news: { name: "MarketAux / The News API", status: "demo" },
        sentiment: { name: "Alternative.me", status: "demo" },
      },
      marketItems: [],
      newsBrief: null,
      newsItems: [],
      sentiment: null,
    };
  }

  return appState.dashboardPayload;
}

function getMarketDataMap() {
  const items = appState.dashboardPayload?.marketItems || [];
  return new Map(items.map((item) => [item.symbol, item]));
}

function getTickerData(symbol) {
  const marketMap = getMarketDataMap();
  return marketMap.get(symbol) || getFallbackTickerData(symbol);
}

function getHeroTickers() {
  return appState.heroTickers;
}

function getActiveHeroTicker() {
  const heroTickers = getHeroTickers();
  if (!heroTickers.length) return "BTC";
  return heroTickers[appState.heroPage % heroTickers.length];
}

function getWatchlistTickers() {
  return appState.watchlistTickers;
}

function getVisibleWatchlistTickers() {
  const tickers = getWatchlistTickers();
  if (tickers.length <= WATCHLIST_WINDOW_SIZE) return tickers;

  const startIndex = appState.watchlistPage % tickers.length;
  return Array.from({ length: WATCHLIST_WINDOW_SIZE }, (_, offset) => (
    tickers[(startIndex + offset) % tickers.length]
  ));
}

function getAllSelectedTickers() {
  return [...appState.heroTickers, ...appState.watchlistTickers];
}

function isStockTicker(symbol) {
  return MARKET_LIBRARY[symbol]?.assetType === "stock";
}

function canUseTicker(symbol) {
  return Boolean(normalizeTicker(symbol));
}

function getTickerStatusLabel(data) {
  if (data.status === "live") return `${data.assetType} · live`;
  return `${data.assetType} · fallback`;
}

function renderBars(container, bars) {
  container.innerHTML = "";
  container.style.setProperty("--bar-count", String(bars.length));
  const measuredHeight = Math.max(0, container.clientHeight || 0);
  const maxDataValue = Math.max(...bars, 1);
  const maxRenderableHeight = Math.max(12, measuredHeight - 4);
  const scale = measuredHeight ? maxRenderableHeight / maxDataValue : 1;

  bars.forEach((height) => {
    const bar = document.createElement("span");
    bar.className = container.id === "heroBars" ? "bar" : "mini-bar";
    const scaledHeight = measuredHeight
      ? Math.max(6, Math.round(height * scale))
      : height;
    bar.style.height = `${scaledHeight}px`;
    container.appendChild(bar);
  });
}

function renderHero() {
  const heroTickers = getHeroTickers();
  const activeHeroTicker = getActiveHeroTicker();
  const hero = getTickerData(activeHeroTicker);
  const tone = getSeriesTone(hero.change24h);
  elements.heroSymbol.textContent = hero.symbol;
  elements.heroValue.textContent = hero.price;
  elements.heroPeriod.textContent = "24H";
  elements.heroChange.textContent = hero.change24h;
  elements.heroWindowLabel.textContent = heroTickers.length
    ? `${(appState.heroPage % heroTickers.length) + 1}/${heroTickers.length} · ${hero.assetType}`
    : "1/1 · Hero";
  elements.heroChange.className = "hero-change";
  elements.heroChange.classList.add(`delta-${tone}`);
  elements.heroBars.className = "bars";
  elements.heroBars.classList.add(`series-${tone}`);
  renderBars(elements.heroBars, hero.bars24h);
}

function renderWatchlist() {
  const allItems = getWatchlistTickers();
  const windowItems = getVisibleWatchlistTickers();
  elements.watchlistRows.innerHTML = "";
  elements.watchlistWindowLabel.textContent = allItems.length
    ? `${Math.min(windowItems.length, WATCHLIST_WINDOW_SIZE)} visible · ${allItems.length} saved`
    : "No watchlist items";

  windowItems.forEach((ticker) => {
    const data = getTickerData(ticker);
    const tone = getSeriesTone(data.change24h);
    const row = document.createElement("article");
    row.className = "watch-row";

    const left = document.createElement("div");
    left.className = "watch-left";
    left.innerHTML = `
      <p class="watch-symbol">${data.symbol}</p>
      <p class="watch-price">${data.price}</p>
    `;

    const right = document.createElement("div");
    right.className = "watch-right";
    const delta = document.createElement("p");
    delta.className = "watch-delta";
    delta.classList.add(`delta-${tone}`);
    delta.textContent = data.change24h;

    const miniBars = document.createElement("div");
    miniBars.className = "mini-bars";
    miniBars.classList.add(`series-${tone}`);
    renderBars(miniBars, data.bars24h);

    right.append(delta, miniBars);
    row.append(left, right);
    elements.watchlistRows.appendChild(row);
  });
}

function renderBrief() {
  const items = appState.dashboardPayload?.newsItems?.length
    ? appState.dashboardPayload.newsItems
    : [
        {
          headline: "Add MARKETAUX_API_TOKEN or THE_NEWS_API_TOKEN to load live headlines.",
          ageLabel: "Demo feed",
          source: "MarketAux / The News API",
          url: "",
          status: "demo",
        },
        {
          headline: "One request can supply multiple compact headlines in this module.",
          ageLabel: "Usage saver",
          source: "Local shell",
          url: "",
          status: "demo",
        },
        {
          headline: "The list layout is optimized for glance reading on the Hagibis screen.",
          ageLabel: "3.5-inch safe",
          source: "Local shell",
          url: "",
          status: "demo",
        },
      ];

  const activeIndex = appState.newsPage % items.length;
  const activeItem = items[activeIndex];
  elements.briefIndex.textContent = String(activeIndex + 1).padStart(2, "0");
  elements.briefTime.textContent = `${activeIndex + 1}/${items.length} · ${activeItem.ageLabel || "Just updated"}${activeItem.source ? ` · ${String(activeItem.source).toUpperCase()}` : ""}`;
  elements.briefHeadline.textContent = normalizeBriefText(activeItem.headline, "Latest AI story");
  elements.briefSubline.textContent = normalizeBriefText(
    activeItem.subline || "Live AI headlines ready for the brief panel.",
    "Live AI headlines ready for the brief panel.",
  );
  elements.briefPanelInteractive.dataset.url = activeItem.url || "";
  elements.briefPanelInteractive.classList.toggle("is-clickable", Boolean(activeItem.url));
  fitBriefStory();
}

function normalizeBriefText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function containsCjk(value) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(String(value || ""));
}

function fitBriefStory() {
  const panel = elements.briefPanel;
  if (!panel) return;

  const text = `${elements.briefHeadline.textContent} ${elements.briefSubline.textContent}`;
  const isCjkHeavy = containsCjk(text);
  const presets = isCjkHeavy
    ? [
        { headline: 26, headlineLine: 1.08, subline: 11, sublineLine: 1.4, marginTop: 10 },
        { headline: 24, headlineLine: 1.08, subline: 11, sublineLine: 1.36, marginTop: 10 },
        { headline: 22, headlineLine: 1.1, subline: 10, sublineLine: 1.32, marginTop: 8 },
        { headline: 20, headlineLine: 1.12, subline: 10, sublineLine: 1.28, marginTop: 8 },
        { headline: 18, headlineLine: 1.14, subline: 9, sublineLine: 1.24, marginTop: 6 },
      ]
    : [
        { headline: 28, headlineLine: 1.08, subline: 12, sublineLine: 1.44, marginTop: 12 },
        { headline: 26, headlineLine: 1.08, subline: 12, sublineLine: 1.4, marginTop: 10 },
        { headline: 24, headlineLine: 1.1, subline: 11, sublineLine: 1.36, marginTop: 10 },
        { headline: 22, headlineLine: 1.1, subline: 10, sublineLine: 1.3, marginTop: 8 },
        { headline: 20, headlineLine: 1.12, subline: 10, sublineLine: 1.26, marginTop: 8 },
        { headline: 18, headlineLine: 1.14, subline: 9, sublineLine: 1.22, marginTop: 6 },
      ];

  for (const preset of presets) {
    panel.style.setProperty("--brief-headline-size", `${preset.headline}px`);
    panel.style.setProperty("--brief-headline-line", String(preset.headlineLine));
    panel.style.setProperty("--brief-subline-size", `${preset.subline}px`);
    panel.style.setProperty("--brief-subline-line", String(preset.sublineLine));
    panel.style.setProperty("--brief-subline-gap", `${preset.marginTop}px`);

    if (panel.scrollHeight <= panel.clientHeight) {
      break;
    }
  }
}

function renderSentiment() {
  const sentiment = appState.dashboardPayload?.sentiment || {
    label: "Sentiment",
    source: "No provider configured",
    value: null,
    classification: "Unavailable",
  };

  elements.sentimentLabel.textContent = sentiment.label;
  elements.sentimentSource.textContent = sentiment.source;
  elements.sentimentValue.textContent = sentiment.value == null ? "—" : String(sentiment.value);
  elements.sentimentClassification.textContent = sentiment.classification;
  elements.gaugeFill.className = "gauge-fill";
  if (typeof sentiment.value === "number") {
    if (sentiment.value >= 60) {
      elements.gaugeFill.classList.add("series-positive");
    } else if (sentiment.value <= 40) {
      elements.gaugeFill.classList.add("series-negative");
    } else {
      elements.gaugeFill.classList.add("series-neutral");
    }
  }
  elements.gaugeFill.style.width = `${Math.max(0, Math.min(100, sentiment.value || 0))}%`;
}

function renderSelectionBucket(listElement, tickers, bucket) {
  listElement.innerHTML = "";

  if (!tickers.length) {
    const item = document.createElement("li");
    item.className = "selected-item selected-item-empty";
    item.innerHTML = `
      <div>
        <div class="selected-ticker">Open slot</div>
        <p class="selected-meta">${bucket === "hero" ? "assign a hero ticker" : "assign a watchlist ticker"}</p>
      </div>
    `;
    listElement.appendChild(item);
    return;
  }

  tickers.forEach((ticker, index) => {
    const item = document.createElement("li");
    item.className = "selected-item";

    const asset = getTickerData(ticker);
    const primaryAction = bucket === "hero"
      ? {
          action: "to-watch",
          label: "Watch",
          disabled: appState.heroTickers.length <= 1,
        }
      : {
          action: "to-hero",
          label: "Make Hero",
          disabled: !canUseTicker(ticker) && isStockTicker(ticker),
        };

    item.innerHTML = `
      <div class="selected-rank">${bucket === "hero" ? `H${index + 1}` : `W${index + 1}`}</div>
      <div>
        <div class="selected-ticker">${ticker}</div>
        <p class="selected-meta">${getTickerStatusLabel(asset)}</p>
      </div>
      <div class="selected-actions">
        <button class="row-action" type="button" data-action="up" data-bucket="${bucket}" data-ticker="${ticker}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="row-action" type="button" data-action="down" data-bucket="${bucket}" data-ticker="${ticker}" ${index === tickers.length - 1 ? "disabled" : ""}>↓</button>
        <button class="row-action" type="button" data-action="${primaryAction.action}" data-bucket="${bucket}" data-ticker="${ticker}" ${primaryAction.disabled ? "disabled" : ""}>${primaryAction.label}</button>
        <button class="row-action" type="button" data-action="remove" data-bucket="${bucket}" data-ticker="${ticker}">Remove</button>
      </div>
    `;

    listElement.appendChild(item);
  });
}

function renderSettingsList() {
  const totalAssigned = getAllSelectedTickers().length;
  elements.selectedCount.textContent = `${totalAssigned} / ${TOTAL_TICKER_LIMIT} assigned`;
  elements.heroSelectionCount.textContent = `${appState.heroTickers.length} / ${HERO_LIMIT}`;
  elements.watchSelectionCount.textContent = `${appState.watchlistTickers.length} / ${WATCHLIST_LIMIT}`;

  renderSelectionBucket(elements.heroTickerList, appState.heroTickers, "hero");
  renderSelectionBucket(elements.watchTickerList, appState.watchlistTickers, "watch");
}

function renderLibrary() {
  elements.cryptoTickerLibrary.innerHTML = "";
  elements.stockTickerLibrary.innerHTML = "";

  Object.keys(MARKET_LIBRARY).forEach((ticker) => {
    const assetType = MARKET_LIBRARY[ticker].assetType;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "library-chip ticker-chip";
    chip.textContent = ticker;
    chip.dataset.action = "add-library";
    chip.dataset.ticker = ticker;

    const inHero = appState.heroTickers.includes(ticker);
    const inWatch = appState.watchlistTickers.includes(ticker);
    const selectedLabel = inHero ? "hero" : inWatch ? "watch" : "";
    const target = appState.assignmentTarget;

    let disabled = false;
    if (!target) {
      disabled = true;
    } else if (target === "hero" && inHero) {
      disabled = true;
    } else if (target === "watch" && inWatch) {
      disabled = true;
    }

    if (selectedLabel) {
      chip.dataset.selected = selectedLabel;
      chip.textContent = `${ticker} · ${selectedLabel.toUpperCase()}`;
    }

    chip.disabled = disabled;

    if (assetType === "crypto") {
      elements.cryptoTickerLibrary.appendChild(chip);
    } else {
      elements.stockTickerLibrary.appendChild(chip);
    }
  });

  const targetLabel = appState.assignmentTarget === "hero"
    ? "Hero"
    : appState.assignmentTarget === "watch"
      ? "Watchlist"
      : "No target";

  elements.assignHeroBtn.classList.toggle("is-active", appState.assignmentTarget === "hero");
  elements.assignWatchBtn.classList.toggle("is-active", appState.assignmentTarget === "watch");
  elements.assignCancelBtn.classList.toggle("is-active", !appState.assignmentTarget);
  const heroWillReplace = appState.assignmentTarget === "hero" && appState.heroTickers.length >= HERO_LIMIT;
  const watchWillReplace = appState.assignmentTarget === "watch" && appState.watchlistTickers.length >= WATCHLIST_LIMIT;
  elements.assignHint.textContent = !appState.assignmentTarget
    ? "Choose Hero or Watchlist first."
    : heroWillReplace
      ? "Hero is full. The next ticker replaces H3."
      : watchWillReplace
        ? "Watchlist is full. The next ticker replaces W4."
        : `Adding next ticker to ${targetLabel}. Tap a ticker below.`;

  elements.libraryStatusCopy.textContent = `${targetLabel} · ${TOTAL_TICKER_LIMIT} total`;
  elements.stockLibraryStatus.textContent = appState.providerHealth.stockMarketProviderConfigured ? "Live now" : "Fallback";
  elements.stockLibrarySection.hidden = false;
  elements.customTargetCopy.textContent = appState.assignmentTarget
    ? `${targetLabel} target`
    : "Choose a target first";
  elements.customTickerSubmit.disabled = !appState.assignmentTarget;
  elements.customTickerSubmit.textContent = appState.assignmentTarget
    ? `Add to ${targetLabel}`
    : "Choose Target";
}

function renderStatus() {
  const payload = ensureDashboardPayload();
  const providerStatuses = [
    payload.providers?.market?.status || "demo",
    payload.providers?.news?.status || "demo",
    payload.providers?.sentiment?.status || "demo",
  ];
  const modeLabel =
    providerStatuses.some((status) => status === "unconfigured")
      ? "Setup needed"
      : providerStatuses.every((status) => status === "live")
      ? "Live data"
      : providerStatuses.some((status) => status === "live")
        ? "Mixed data"
        : "Fallback data";
  const heroCount = appState.heroTickers.length;
  const watchCount = appState.watchlistTickers.length;
  elements.statusCopy.textContent = `${modeLabel} · ${heroCount} hero slot${heroCount === 1 ? "" : "s"} · ${watchCount} watchlist slot${watchCount === 1 ? "" : "s"}`;
  elements.rotationToggle.checked = appState.rotationEnabled;
}

function renderAll() {
  renderHero();
  renderWatchlist();
  renderBrief();
  renderSentiment();
  renderSettingsList();
  renderLibrary();
  renderStatus();
  saveState();
}

async function refreshMarketData() {
  const params = new URLSearchParams({
    tickers: getAllSelectedTickers().join(","),
  });

  try {
    const response = await fetch(`/api/market?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Market request failed with ${response.status}`);
    }

    const payload = await response.json();
    const current = ensureDashboardPayload();
    current.marketItems = payload.marketItems || [];
    current.providers.market = payload.provider || { name: "CoinGecko", status: "demo" };
  } catch (error) {
    console.error("Failed to refresh market data", error);
    ensureDashboardPayload().providers.market = { name: "CoinGecko", status: "demo" };
  }

  renderHero();
  renderWatchlist();
  renderStatus();
}

async function refreshHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) {
      throw new Error(`Health request failed with ${response.status}`);
    }
    const payload = await response.json();
    appState.providerHealth.stockMarketProviderConfigured = Boolean(payload.stockMarketProviderConfigured);
    appState.providerHealth.newsProviderConfigured = Boolean(payload.newsProviderConfigured);
  } catch (error) {
    console.error("Failed to refresh provider health", error);
    appState.providerHealth.stockMarketProviderConfigured = false;
    appState.providerHealth.newsProviderConfigured = false;
  }

  renderSettingsList();
  renderLibrary();
}

async function refreshNewsData() {
  try {
    const params = new URLSearchParams({
      tickers: getAllSelectedTickers().join(","),
    });
    const response = await fetch(`/api/news?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`News request failed with ${response.status}`);
    }

    const payload = await response.json();
    const current = ensureDashboardPayload();
    current.newsBrief = payload.newsBrief || null;
    current.newsItems = payload.newsItems || [];
    current.providers.news = payload.provider || { name: "MarketAux / The News API", status: "demo" };
    appState.newsPage = 0;
  } catch (error) {
    console.error("Failed to refresh news data", error);
    ensureDashboardPayload().providers.news = { name: "MarketAux / The News API", status: "demo" };
  }

  renderBrief();
  renderStatus();
}

async function refreshSentimentData() {
  try {
    const response = await fetch("/api/sentiment");
    if (!response.ok) {
      throw new Error(`Sentiment request failed with ${response.status}`);
    }

    const payload = await response.json();
    const current = ensureDashboardPayload();
    current.sentiment = payload.sentiment || null;
    current.providers.sentiment = payload.provider || { name: "Alternative.me", status: "demo" };
  } catch (error) {
    console.error("Failed to refresh sentiment data", error);
    ensureDashboardPayload().providers.sentiment = { name: "Alternative.me", status: "demo" };
  }

  renderSentiment();
  renderStatus();
}

function addTickerToBucket(ticker, bucket) {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return;
  if (!canUseTicker(normalized)) return;
  const alreadyInHero = appState.heroTickers.includes(normalized);
  const alreadyInWatch = appState.watchlistTickers.includes(normalized);

  appState.heroTickers = appState.heroTickers.filter((item) => item !== normalized);
  appState.watchlistTickers = appState.watchlistTickers.filter((item) => item !== normalized);

  if (bucket === "hero") {
    if (appState.heroTickers.length >= HERO_LIMIT) {
      const displaced = appState.heroTickers.pop();
      if (displaced && !appState.watchlistTickers.includes(displaced)) {
        if (appState.watchlistTickers.length >= WATCHLIST_LIMIT) {
          appState.watchlistTickers.pop();
        }
        appState.watchlistTickers.unshift(displaced);
      }
    }
    appState.heroTickers.push(normalized);
  } else {
    if (appState.watchlistTickers.length >= WATCHLIST_LIMIT) {
      appState.watchlistTickers.pop();
    }
    appState.watchlistTickers.push(normalized);
  }

  renderAll();
  restartRotation();
  restartWatchlistRotation();
  refreshMarketData();
}

function removeTicker(ticker) {
  appState.heroTickers = appState.heroTickers.filter((item) => item !== ticker);
  appState.watchlistTickers = appState.watchlistTickers.filter((item) => item !== ticker);
  if (!appState.heroTickers.length) {
    if (appState.watchlistTickers.length) {
      appState.heroTickers.push(appState.watchlistTickers.shift());
    } else {
      appState.heroTickers = ["BTC"];
    }
  }
  appState.heroPage = 0;
  appState.watchlistPage = 0;
  renderAll();
  restartRotation();
  restartWatchlistRotation();
  refreshMarketData();
}

function moveTickerWithinBucket(ticker, direction, bucket) {
  const list = bucket === "hero" ? [...appState.heroTickers] : [...appState.watchlistTickers];
  const index = list.indexOf(ticker);
  if (index < 0) return;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  if (bucket === "hero") {
    appState.heroTickers = list;
  } else {
    appState.watchlistTickers = list;
  }
  appState.heroPage = 0;
  appState.watchlistPage = 0;
  renderAll();
  restartRotation();
  restartWatchlistRotation();
  refreshMarketData();
}

function moveTickerToBucket(ticker, bucket) {
  if (!canUseTicker(ticker)) return;
  const isInHero = appState.heroTickers.includes(ticker);
  const isInWatch = appState.watchlistTickers.includes(ticker);

  if (bucket === "hero") {
    if (isInHero) return;
    if (!isInWatch) {
      addTickerToBucket(ticker, "hero");
      return;
    }
    appState.watchlistTickers = appState.watchlistTickers.filter((item) => item !== ticker);
    if (appState.heroTickers.length >= HERO_LIMIT) {
      const demoted = appState.heroTickers.pop();
      if (demoted) {
        if (appState.watchlistTickers.length >= WATCHLIST_LIMIT) {
          appState.watchlistTickers.pop();
        }
        appState.watchlistTickers.unshift(demoted);
      }
    }
    appState.heroTickers.push(ticker);
  } else {
    if (isInWatch) return;
    if (isInHero && appState.heroTickers.length <= 1) return;
    if (!isInHero) {
      addTickerToBucket(ticker, "watch");
      return;
    }
    appState.heroTickers = appState.heroTickers.filter((item) => item !== ticker);
    if (appState.watchlistTickers.length >= WATCHLIST_LIMIT) {
      appState.watchlistTickers.pop();
    }
    appState.watchlistTickers.unshift(ticker);
  }

  appState.heroPage = 0;
  appState.watchlistPage = 0;
  renderAll();
  restartRotation();
  restartWatchlistRotation();
  refreshMarketData();
}

function openSettings() {
  elements.settingsBackdrop.hidden = false;
}

function closeSettings() {
  elements.settingsBackdrop.hidden = true;
}

function rotateHero() {
  const heroCount = getHeroTickers().length;
  if (!appState.rotationEnabled || heroCount <= 1) return;
  appState.heroPage = (appState.heroPage + 1) % heroCount;
  renderHero();
}

function rotateWatchlist() {
  const watchCount = getWatchlistTickers().length;
  if (watchCount <= WATCHLIST_WINDOW_SIZE) return;
  appState.watchlistPage = (appState.watchlistPage + 1) % watchCount;
  renderWatchlist();
}

function rotateNewsBrief() {
  const items = appState.dashboardPayload?.newsItems || [];
  if (items.length <= 1) return;
  appState.newsPage = (appState.newsPage + 1) % items.length;
  renderBrief();
}

function restartRotation() {
  if (appState.heroRotationTimer) {
    window.clearInterval(appState.heroRotationTimer);
  }
  if (appState.rotationEnabled && getHeroTickers().length > 1) {
    appState.heroRotationTimer = window.setInterval(rotateHero, HERO_ROTATION_INTERVAL_MS);
  }
}

function restartWatchlistRotation() {
  if (appState.watchlistRotationTimer) {
    window.clearInterval(appState.watchlistRotationTimer);
  }
  if (getWatchlistTickers().length > WATCHLIST_WINDOW_SIZE) {
    appState.watchlistRotationTimer = window.setInterval(rotateWatchlist, WATCHLIST_ROTATION_INTERVAL_MS);
  }
}

function restartNewsRotation() {
  if (appState.newsRotationTimer) {
    window.clearInterval(appState.newsRotationTimer);
  }
  appState.newsRotationTimer = window.setInterval(rotateNewsBrief, NEWS_ROTATION_INTERVAL_MS);
}

function restartDataRefresh() {
  if (appState.marketRefreshTimer) {
    window.clearInterval(appState.marketRefreshTimer);
  }
  if (appState.newsRefreshTimer) {
    window.clearInterval(appState.newsRefreshTimer);
  }
  if (appState.sentimentRefreshTimer) {
    window.clearInterval(appState.sentimentRefreshTimer);
  }

  appState.marketRefreshTimer = window.setInterval(refreshMarketData, MARKET_REFRESH_INTERVAL_MS);
  appState.newsRefreshTimer = window.setInterval(refreshNewsData, NEWS_REFRESH_INTERVAL_MS);
  appState.sentimentRefreshTimer = window.setInterval(refreshSentimentData, SENTIMENT_REFRESH_INTERVAL_MS);
}

function openCurrentBriefArticle() {
  const url = elements.briefPanelInteractive.dataset.url || "";
  if (!url) return;

  window.open(url, "_blank", "noopener,noreferrer");
}

function handleCustomTickerSubmit(event) {
  event.preventDefault();
  const ticker = normalizeTicker(elements.customTickerInput.value);
  if (!appState.assignmentTarget || !ticker) return;
  moveTickerToBucket(ticker, appState.assignmentTarget);
  elements.customTickerInput.value = "";
}

function handleSelectedListClick(event) {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) return;
  const action = actionButton.getAttribute("data-action");
  const ticker = actionButton.getAttribute("data-ticker");
  const bucket = actionButton.getAttribute("data-bucket");
  if (!action || !ticker) return;

  if (action === "remove") removeTicker(ticker);
  if (action === "up" && bucket) moveTickerWithinBucket(ticker, "up", bucket);
  if (action === "down" && bucket) moveTickerWithinBucket(ticker, "down", bucket);
  if (action === "to-hero") moveTickerToBucket(ticker, "hero");
  if (action === "to-watch") moveTickerToBucket(ticker, "watch");
}

function handleLibraryClick(event) {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) return;
  const action = actionButton.getAttribute("data-action");
  const ticker = actionButton.getAttribute("data-ticker");
  if (!action || !ticker) return;

  if (action === "add-library" && appState.assignmentTarget) {
    moveTickerToBucket(ticker, appState.assignmentTarget);
  }
}

function setAssignmentTarget(target) {
  appState.assignmentTarget = target;
  renderLibrary();
}

function bindEvents() {
  window.addEventListener("resize", handleViewportResize);
  elements.openSettingsBtn.addEventListener("click", openSettings);
  elements.closeSettingsBtn.addEventListener("click", closeSettings);
  elements.briefPanelInteractive.addEventListener("click", openCurrentBriefArticle);
  elements.briefPanelInteractive.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCurrentBriefArticle();
    }
  });
  elements.settingsBackdrop.addEventListener("click", (event) => {
    if (event.target === elements.settingsBackdrop) closeSettings();
  });
  elements.customTickerForm.addEventListener("submit", handleCustomTickerSubmit);
  elements.heroTickerList.addEventListener("click", handleSelectedListClick);
  elements.watchTickerList.addEventListener("click", handleSelectedListClick);
  elements.cryptoTickerLibrary.addEventListener("click", handleLibraryClick);
  elements.stockTickerLibrary.addEventListener("click", handleLibraryClick);
  elements.assignHeroBtn.addEventListener("click", () => setAssignmentTarget("hero"));
  elements.assignWatchBtn.addEventListener("click", () => setAssignmentTarget("watch"));
  elements.assignCancelBtn.addEventListener("click", () => setAssignmentTarget(null));
  elements.rotationToggle.addEventListener("change", (event) => {
    appState.rotationEnabled = event.target.checked;
    appState.heroPage = 0;
    renderAll();
    restartRotation();
  });
}

async function init() {
  syncCanvasScale();
  loadState();
  ensureDashboardPayload();
  bindEvents();
  renderAll();
  await refreshHealth();
  restartRotation();
  restartWatchlistRotation();
  restartNewsRotation();
  restartDataRefresh();
  await Promise.all([refreshMarketData(), refreshNewsData(), refreshSentimentData()]);
}

init();
