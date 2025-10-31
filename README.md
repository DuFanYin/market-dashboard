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
  app/
    api/
      market/route.ts   # App Router endpoint: GET /api/market (aggregates server data)
    dashboard/
      page.tsx          # Client page: UI and client-side polling
      page.module.css   # CSS module for Fear & Greed visuals
    layout.tsx          # Root layout and global styles
    page.tsx            # Redirects to /dashboard
    globals.css         # Tailwind base and global styles
  lib/
    data.ts             # Server-side fetchers/parsers for CNN/OKX/AHR999/Gold + helpers
  types/
    market.ts           # Shared types for API responses
```

## Data Flow
- Client (`src/app/dashboard/page.tsx`)
  - Renders the dashboard and manages polling with `useEffect`
  - Determines US market open status in New York time
  - Calls the app API (`/api/market`) on intervals, updates state for each section
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
- `dashboard/page.tsx` is a client component to enable client-side polling
- Server route `/api/market` enforces `cache: "no-store"` for live data
- Stable ordering for OKX rows is guaranteed based on input symbols to avoid row flicker
- Minimal styling is implemented with Tailwind + a small CSS module; the layout is responsive and mobile-optimized

## Future Improvements
- Add error toasts or inline retry for network failures
- Expand crypto instruments and make selection user-configurable
- Persist lightweight client cache between route transitions
- Add unit tests for data parsing and AHR999 computation

