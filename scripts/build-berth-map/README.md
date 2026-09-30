# Berth Map Builder

This script builds `rail-api/berth-map.json` from Network Rail reference data.

## What it does

- Reads SMART berth-step data (TD area + berth → STANOX/TIPLOC).
- Reads CORPUS location data (STANOX/TIPLOC → CRS + coordinates).
- Produces a JSON map: `"area:berth" → { crs, lat, lng, area, berth }`.
- Writes the result to `../../rail-api/berth-map.json`.

## Prerequisites

- Node.js 18+ (or Python 3.10+ if you prefer the Python version).
- Network Rail open data credentials (username/password) to download:
  - SMART reference data (berth steps)
  - CORPUS reference data (locations)

## Data sources

You must obtain the latest reference data from Network Rail:

- SMART: berth stepping data (maps TD berths to STANOX/TIPLOC).
- CORPUS: location reference (maps STANOX/TIPLOC to CRS and coordinates).

Typical sources:

- Network Rail open data feeds portal (requires account).
- Internal data share if you work with a TOC/infrastructure manager.

Place the downloaded files in this folder:

- `smart_berths.csv` (or `.json`/`.xml` depending on your export)
- `corpus_locations.csv` (or `.json`/`.xml`)

Adjust the parser in `build-berth-map.js` if your files have different names/formats.

## Running the builder

From this folder:

```bash
npm install
node build-berth-map.js
```

This will:

1. Load and parse SMART and CORPUS files.
2. Join them to produce a full berth → location map.
3. Write `../../rail-api/berth-map.json`.

Commit the updated `berth-map.json` to the repo and redeploy the API.

## Notes

- This is an offline, one-time (or periodic) build step. Do not run it inside Render.
- The runtime API only reads `berth-map.json`; it does not modify it in production.
- If you later get updated reference data, re-run this script and commit the new map.
