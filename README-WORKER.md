# UK Live Train Map Worker

Cloudflare Worker that displays live UK train locations and railway signals on an interactive map.

## Features

- 🚂 Live train positions with heading indicators
- 🚦 Railway signal states (green/yellow/red)
- 🗺️ Interactive Leaflet map with OpenStreetMap tiles
- ⚡ Auto-refresh every 30 seconds (configurable)
- 🔑 Support for Transport API integration

## Deployment

### 1. Install dependencies

```bash
npm install
```

### 2. Set up secrets (optional, for real data)

```bash
wrangler secret put TRANSPORT_API_KEY
```

### 3. Deploy

```bash
npm run deploy
```

### 4. Access the map

Visit your Worker URL (e.g., `https://uk-live-train-map-worker.<your-subdomain>.workers.dev`)

## API Endpoints

- `GET /api/trains` - Returns live train data
- `GET /api/signals` - Returns signal states
- `GET /` - Serves the interactive map HTML

## Configuration

Edit `wrangler.toml` to customize:

- `REFRESH_INTERVAL_SECONDS` - How often the map refreshes (default: 30)
- `MAP_CENTER_LAT`, `MAP_CENTER_LNG` - Map center coordinates
- `MAP_ZOOM` - Initial zoom level

## Demo Mode

Without API keys, the Worker serves demo data showing sample trains and signals around London.

## License

MIT
