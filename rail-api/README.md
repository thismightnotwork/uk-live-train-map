# Network Rail API for Render

Backend service that connects to Network Rail's real-time data feeds and exposes a simple REST API.

## Deploy to Render

1. **Push this repo to GitHub**

2. **Create new Web Service on Render**:
   - Connect your GitHub repo
   - Root directory: `rail-api`
   - Environment: Node
   - Build command: `npm install`
   - Start command: `npm start`

3. **Add environment variables** in Render dashboard:
   - `NR_USERNAME` — Your Network Rail username
   - `NR_PASSWORD` — Your Network Rail password
   - `PORT` — 3000

4. **Deploy**!

## API Endpoints

- `GET /api/trains` — Live train locations
- `GET /api/signals` — Signal states (demo for now)
- `GET /health` — Health check

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

## Next Steps

- Add TD feed signal aspect parsing (bitmap format)
- Add SMART/CORPUS reference data for signal locations
- Cache data to reduce API calls
