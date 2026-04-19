# Hagibis Data Contract

This file defines the normalized shapes consumed by the Hagibis dashboard UI.

## Dashboard payload

```json
{
  "fetchedAt": "2026-04-13T16:00:00.000Z",
  "fetchedAtLabel": "Just updated",
  "dataMode": "live | mixed | demo",
  "providers": {
    "market": { "name": "Crypto.com Exchange", "status": "live | mixed | demo" },
    "news": { "name": "The News API", "status": "live | demo" },
    "sentiment": { "name": "Alternative.me", "status": "live | demo" }
  },
  "marketItems": [],
  "newsItems": [],
  "newsBrief": {},
  "sentiment": {}
}
```

## Market item

```json
{
  "symbol": "BTC",
  "assetType": "crypto",
  "price": "$72.4K",
  "change24h": "+3.8%",
  "bars24h": [24, 36, 48, 60],
  "status": "live | demo"
}
```

Rules:

- `price` is already display formatted for the UI.
- `change24h` is already display formatted for the UI.
- `bars24h` is a 4-bar normalized height array for the mini chart and hero trend box.

## News brief

```json
{
  "headline": "Open-source video models accelerate again.",
  "subline": "Labs ship faster inference and edit flows.",
  "ageLabel": "2h ago · example.com",
  "source": "example.com",
  "status": "live | demo"
}
```

Rules:

- `headline` is the primary brief line.
- `subline` is a short secondary line, not full article body text.
- `ageLabel` is already formatted for the compact UI.

## News items

```json
[
  {
    "headline": "Anthropic releases updated Claude features for enterprise users.",
    "subline": "Short optional support line.",
    "ageLabel": "51m ago",
    "source": "cnbc.com",
    "status": "live | demo"
  }
]
```

Rules:

- `newsItems` is the compact 3-story list shown in the AI brief panel.
- one API request should populate all displayed stories.

## Sentiment

```json
{
  "label": "Crypto Fear & Greed",
  "source": "Alternative.me",
  "value": 68,
  "classification": "Greed",
  "status": "live | demo | unconfigured"
}
```

Rules:

- `value` should be `null` if no source is configured.
