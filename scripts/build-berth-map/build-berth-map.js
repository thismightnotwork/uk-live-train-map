import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CONFIGURE THESE PATHS TO MATCH YOUR DOWNLOADED FILES
const SMART_PATH = join(__dirname, 'smart_berths.csv');
const CORPUS_PATH = join(__dirname, 'corpus_locations.csv');
const OUTPUT_PATH = join(__dirname, '../../rail-api/berth-map.json');

// Adjust column names to match your actual CSV exports
const SMART_COLUMNS = {
  tdArea: 'td_area',
  berth: 'berth',
  stanox: 'stanox',
  tiploc: 'tiploc',
};

const CORPUS_COLUMNS = {
  stanox: 'stanox',
  tiploc: 'tiploc',
  crs: 'crs',
  lat: 'latitude',
  lng: 'longitude',
};

function loadSmart() {
  const text = readFileSync(SMART_PATH, 'utf8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const byKey = new Map();
  for (const row of records) {
    const tdArea = row[SMART_COLUMNS.tdArea];
    const berth = row[SMART_COLUMNS.berth];
    const stanox = row[SMART_COLUMNS.stanox];
    const tiploc = row[SMART_COLUMNS.tiploc];
    if (!tdArea || !berth) continue;
    const key = `${tdArea}:${berth}`;
    if (!byKey.has(key)) {
      byKey.set(key, { stanox, tiploc });
    }
  }
  return byKey;
}

function loadCorpus() {
  const text = readFileSync(CORPUS_PATH, 'utf8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const byStanox = new Map();
  const byTiploc = new Map();
  for (const row of records) {
    const stanox = row[CORPUS_COLUMNS.stanox];
    const tiploc = row[CORPUS_COLUMNS.tiploc];
    const crs = row[CORPUS_COLUMNS.crs];
    const lat = parseFloat(row[CORPUS_COLUMNS.lat]);
    const lng = parseFloat(row[CORPUS_COLUMNS.lng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const entry = { crs, lat, lng };
    if (stanox) byStanox.set(stanox, entry);
    if (tiploc) byTiploc.set(tiploc, entry);
  }
  return { byStanox, byTiploc };
}

function buildBerthMap() {
  console.log('Loading SMART data...');
  const smart = loadSmart();
  console.log(`Loaded ${smart.size} SMART berth entries`);

  console.log('Loading CORPUS data...');
  const { byStanox, byTiploc } = loadCorpus();
  console.log(`Loaded ${byStanox.size} STANOX + ${byTiploc.size} TIPLOC locations`);

  const berthMap = {};
  let resolved = 0;
  let fallback = 0;

  for (const [key, { stanox, tiploc }] of smart.entries()) {
    let location = null;
    if (stanox && byStanox.has(stanox)) {
      location = byStanox.get(stanox);
    } else if (tiploc && byTiploc.has(tiploc)) {
      location = byTiploc.get(tiploc);
    }

    if (location) {
      berthMap[key] = {
        crs: location.crs,
        lat: location.lat,
        lng: location.lng,
        area: key.split(':')[0],
        berth: key.split(':')[1],
      };
      resolved++;
    } else {
      // Fallback entry; these can be enriched later
      const [area, berth] = key.split(':');
      berthMap[key] = {
        crs: berth || 'XXX',
        lat: 51.5074,
        lng: -0.1278,
        area,
        berth,
      };
      fallback++;
    }
  }

  console.log(`Built berth map: ${resolved} resolved, ${fallback} fallback entries`);
  return berthMap;
}

const berthMap = buildBerthMap();
writeFileSync(OUTPUT_PATH, JSON.stringify(berthMap, null, 2), 'utf8');
console.log(`Wrote berth map to ${OUTPUT_PATH}`);
