# Market Dashboard

A lightweight, production-ready Next.js dashboard that tracks macro indexes, crypto prices, CNN Fear & Greed, AHR999, and spot Gold (XAU/USD). It renders fast, auto-refreshes on sensible cadences, and deploys cleanly to Vercel.

## Features
- Markets section: CNN indexes (DJI, S&P 500, NASDAQ), OKX crypto index prices (BTC/ETH), and XAU/USD spot
- Fear & Greed: score, rating, gradient bar, historical snapshots, and component signals
- AHR999: computed client view with current zone coloring
- US market status banner: OPEN/CLOSED with NY time and a 60s refresh countdown
- Smart polling
  - Crypto (OKX) + XAU/USD: every 60s (always)
  - CNN Indexes + Fear & Greed: every 60s only when US market is open (Mon–Fri, 9:30–16:00 ET)
  - AHR999: every 5 minutes
- Responsive UI: mobile-first tweaks (smaller paddings, compact tables, nowrap chips)

## Project Structure
```
src/
├── app
│   ├── api
│   │   └── market
│   │       └── route.ts
│   ├── dashboard
│   │   ├── page.module.css
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components
│   ├── FearGreedPanel.tsx
│   └── MarketsTable.tsx
├── hooks
│   └── useMarketData.ts
├── lib
│   └── data.ts
└── types
    ├── market.ts
    └── routes.d.ts
```

## Data Flow
- Client Components (`src/app/dashboard/page.tsx`)
  - Main dashboard page that orchestrates layout and renders child components
  - Uses `useMarketData` hook for all data logic and state management
  - Transforms raw data into display-ready format (marketRows)
  - Renders `MarketsTable` and `FearGreedPanel` components
- Custom Hook (`src/hooks/useMarketData.ts`)
  - Encapsulates all data fetching, polling intervals, and state management
  - Manages intervals: 1s countdown, 30s market status, 60s refresh, 300s AHR update
  - Determines US market open status in New York time via `computeUsOpen()`
  - Calls the app API (`/api/market`) on intervals, updates state for each section
  - Returns: `{ data, isUsMarketOpen, nyTimeLabel, next5In, handleRefresh }`
- UI Components (`src/components/`)
  - `MarketsTable`: Renders markets table (CNN indexes, crypto, gold, AHR999)
  - `FearGreedPanel`: Renders Fear & Greed panel (score, gradient, historical, components)
- Server API (`src/app/api/market/route.ts`)
  - Aggregates fresh data from external sources via `lib/data.ts`
  - Returns: `{ cnnIndexes, cnnFearGreed, okx, gold, ahr }`
- Fetchers (`src/lib/data.ts`)
  - `getCnnMarketIndexes()` – CNN markets endpoint
  - `getCnnFearGreed()` – CNN F&G endpoint
  - `getOkxPrices()` – OKX index tickers (BTC/ETH)
  - `getGoldPrice()` – Spot gold XAU/USD from goldprice.org (`https://data-asg.goldprice.org/dbXRates/USD`)
  - `getAhr999()` – Computes AHR999 using OKX candles + ticker

## Refresh Cadence
- 60s cycle: Always updates crypto and XAU/USD; updates CNN and Fear & Greed only if US market is open
- 5m cycle: Updates AHR999
- Top banner shows a live countdown to the next refresh

## Commands
- Development: `npm run dev`
- Type check + Build: `npm run build`
- Start production server: `npm run start`

## Deployment (Vercel)
1. Push the repository to GitHub
2. Import the project in Vercel (framework auto-detected: Next.js)
3. Build command: `next build` (default)
4. Output directory: `.next` (default)
5. No environment variables required

## Notes & Decisions
- `dashboard/page.tsx` is a client component focused on layout structure
- Data logic is extracted into `useMarketData` custom hook for separation of concerns
- UI is split into `MarketsTable` and `FearGreedPanel` components for maintainability
- Server route `/api/market` enforces `cache: "no-store"` for live data
- Stable ordering for OKX rows is guaranteed based on input symbols to avoid row flicker
- Minimal styling is implemented with Tailwind + a small CSS module; the layout is responsive and mobile-optimized

## Future Improvements
- Add error toasts or inline retry for network failures
- Expand crypto instruments and make selection user-configurable
- Persist lightweight client cache between route transitions
- Add unit tests for data parsing and AHR999 computation

