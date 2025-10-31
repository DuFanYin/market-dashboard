# Market Dashboard

A lightweight, production-ready Next.js dashboard that tracks macro indexes, crypto prices, CNN Fear & Greed, and AHR999. It renders fast, auto-refreshes on sensible cadences, and deploys cleanly to Vercel.

## Features
- Markets section: CNN indexes (DJI, S&P 500, NASDAQ) and OKX crypto index prices
- Fear & Greed: score, rating, gradient bar, historical snapshots, and component signals
- AHR999: computed client view with current zone coloring
- US market status banner: OPEN/CLOSED with NY time and a 5s refresh countdown
- Smart polling
  - Crypto (OKX): every 5s (always)
  - CNN Indexes + Fear & Greed: every 5s only when US market is open (Mon–Fri, 9:30–16:00 ET)
  - AHR999: every 5 minutes
- Responsive UI: works well on mobile and desktop

## Project Structure
```
src/
  app/
    api/route.ts        # Single API endpoint that aggregates server-side data fetches
    layout.tsx          # Root layout and global styles
    page.tsx            # Client component: UI, polling, and rendering
    globals.css         # Tailwind base and global styles
  lib/
    data.ts             # Server-side fetchers/parsers for CNN/OKX/AHR999 + helpers
    api.ts              # (Optional) client fetch helper (unused in main flow)
  types/
    market.ts           # Shared types for API responses
```

## Data Flow
- Client (`src/app/page.tsx`)
  - Renders the dashboard and manages polling with `useEffect`
  - Determines US market open status in New York time
  - Calls the app API (`/api`) on intervals, updates state for each section
- Server API (`src/app/api/route.ts`)
  - On each call, aggregates fresh data from external sources via `lib/data.ts`
  - Returns: `{ cnnIndexes, cnnFearGreed, okx, ahr }`
- Fetchers (`src/lib/data.ts`)
  - `getCnnMarketIndexes()` – CNN markets endpoint
  - `getCnnFearGreed()` – CNN F&G endpoint
  - `getOkxPrices()` – OKX index tickers (BTC/ETH)
  - `getAhr999()` – Computes AHR999 using OKX candles + ticker
  - Includes minimal console logging for observability

## Refresh Cadence
- 5s cycle: Always updates crypto; updates CNN and Fear & Greed only if market is open
- 5m cycle: Updates AHR999
- Top banner shows a live countdown to the next 5s refresh

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
- `page.tsx` is a client component to enable fine-grained polling without SSR coupling
- Server route `/api` enforces `cache: "no-store"` for live data
- Stable ordering for OKX rows is guaranteed based on input symbols to avoid row flicker
- Minimal styling is implemented with Tailwind; the layout remains simple and responsive

## Future Improvements
- Add error toasts or inline retry for network failures
- Expand crypto instruments and make selection user-configurable
- Persist lightweight client cache between route transitions
- Add unit tests for data parsing and AHR999 computation

