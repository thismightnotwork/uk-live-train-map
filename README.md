# UK Live Train Map

Responsive Leaflet map showing UK train positions, routes, and signals.

- Mobile-first UI
- Click a train to focus and show its route + signals
- Demo data included; configure `LIVE_POSITIONS_URL` in `src/lib/api.js` for real feeds
- GitHub Pages deployment via Actions

## Local dev

```bash
npm install
npm run dev
```

## Deploy

Push to `main`, then enable GitHub Pages with **Source: GitHub Actions** in repo Settings.
