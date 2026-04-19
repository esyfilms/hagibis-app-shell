# Hagibis App Shell

This folder contains a standalone browser prototype for the Hagibis mini-screen dashboard.

## Device targeting

- preview canvas is locked to `960x640`
- browser resizing now scales the canvas for preview only
- layout decisions are made against the Hagibis stage, not generic desktop widths

## Data providers

- `CoinGecko` for crypto prices and 24-hour trend history
- `MarketAux` for ticker-aware market headlines
- `The News API` as fallback for AI headlines
- `Alternative.me` for crypto Fear & Greed
- the shell falls back gracefully when providers are not configured

## Included in this shell

- markets home preview
- mixed crypto + stock watchlist with a hard `7` item cap
- settings panel to:
  - add crypto and stock tickers from a preset library
  - add a custom ticker
  - reorder crypto tickers manually
  - remove crypto tickers
  - rotate the first `3` selected tickers through the hero panel

## Current data mode

- live provider adapters are wired through `/api/dashboard`
- if provider keys are missing, the shell falls back gracefully
- the first `3` selected tickers rotate in the hero panel
- up to `4` watchlist tickers are stored, with `2` shown on-screen at a time
- stock market data uses `Finnhub`
- news prefers `MarketAux` when a ticker-aware feed is available

## Provider setup

Create `.env.local` in this folder with:

```bash
MARKETAUX_API_TOKEN=your_marketaux_api_token
THE_NEWS_API_TOKEN=your_the_news_api_token
FINNHUB_API_KEY=your_finnhub_api_key
```

`CoinGecko` public market data does not require a key.

`Alternative.me` does not require a key for the Fear & Greed endpoint.

## Run locally

```bash
cd hagibis-app-shell
./run-local.sh
```

What happens:

- the shell looks for an open port starting at `4184`
- if `4184` is already taken, it automatically picks the next open port
- it opens the page in your default browser automatically
- the terminal stays attached to the local server until you press `Ctrl+C`

If you want to force a different starting port:

```bash
./run-local.sh 4300
```
