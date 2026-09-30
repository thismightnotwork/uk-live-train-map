const express = require('express');
const cors = require('cors');
const { Client } = require('@stomp/stompjs');
const WebSocket = require('websocket');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NR_USERNAME = process.env.NR_USERNAME;
const NR_PASSWORD = process.env.NR_PASSWORD;
const NR_HOST = 'publicdatafeeds.networkrail.co.uk';
const NR_PORT = 61618;

const trains = new Map();
let lastUpdate = null;
const lastRawTdBodies = [];

// Berth map state
const berthMapPath = path.join(__dirname, 'berth-map.json');
let berthMap = {};
let berthMapReady = false;

const stationCoords = {
  'VIC': { lat: 51.4952, lng: -0.1441 },
  'LBG': { lat: 51.5065, lng: -0.0856 },
  'WAT': { lat: 51.5031, lng: -0.1132 },
  'LST': { lat: 51.5180, lng: -0.0817 },
  'PAD': { lat: 51.5154, lng: -0.1755 },
  'EUS': { lat: 51.5282, lng: -0.1337 },
  'KGX': { lat: 51.5308, lng: -0.1238 },
  'LIV': { lat: 51.5178, lng: -0.0823 },
  'CLJ': { lat: 51.4640, lng: -0.1700 },
  'SQY': { lat: 51.4980, lng: -0.0520 },
};

function lookupBerth(area, berth) {
  const key = `${area}:${berth}`;
  return berthMap[key] || null;
}

// Fetch SMART reference data and build berthMap
function fetchSmartAndBuildMap() {
  return new Promise((resolve, reject) => {
    const url = 'https://publicdatafeeds.networkrail.co.uk/ntrod/SupportingFileAuthenticate?type=SMART';
    const options = {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(NR_USERNAME + ':' + NR_PASSWORD).toString('base64'),
      },
    };
    console.log('📥 Fetching SMART reference data...');
    https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`SMART fetch failed: ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const csv = Buffer.concat(chunks).toString('utf8');
        const lines = csv.split(/\r?\n/).filter(l => l.trim());
        // Expect header: AREA,BERTH,TIPLOC,CRS,LAT,LNG,... (approx)
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const idx = {
          area: header.indexOf('area'),
          berth: header.indexOf('berth'),
          tiploc: header.indexOf('tiploc'),
          crs: header.indexOf('crs'),
          lat: header.indexOf('lat'),
          lng: header.indexOf('lng'),
        };
        const newMap = {};
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols.length < Math.max(idx.area, idx.berth, idx.crs, idx.lat, idx.lng) + 1) continue;
          const area = cols[idx.area];
          const berth = cols[idx.berth];
          const crs = cols[idx.crs] || '';
          const lat = parseFloat(cols[idx.lat]);
          const lng = parseFloat(cols[idx.lng]);
          if (!area || !berth || !crs || isNaN(lat) || isNaN(lng)) continue;
          newMap[`${area}:${berth}`] = { crs, lat, lng };
        }
        berthMap = newMap;
        fs.writeFileSync(berthMapPath, JSON.stringify(berthMap, null, 2));
        berthMapReady = true;
        console.log('✅ Built berth-map.json with', Object.keys(berthMap).length, 'entries');
        resolve();
      });
    }).on('error', reject);
  });
}

// Initialize berth map
async function initBerthMap() {
  try {
    if (fs.existsSync(berthMapPath)) {
      const data = fs.readFileSync(berthMapPath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 100) {
        berthMap = parsed;
        berthMapReady = true;
        console.log('✅ Loaded existing berth-map.json with', Object.keys(berthMap).length, 'entries');
        return;
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not load existing berth-map.json:', e.message);
  }
  try {
    await fetchSmartAndBuildMap();
  } catch (e) {
    console.error('❌ Failed to build berth map:', e.message);
  }
}

global.WebSocket = WebSocket.w3cwebsocket;

const stompClient = new Client({
  brokerURL: `ws://${NR_HOST}:${NR_PORT}/ws`,
  connectHeaders: { login: NR_USERNAME, passcode: NR_PASSWORD },
  debug: (str) => console.log('[STOMP]', str),
  reconnectDelay: 5000,
});

stompClient.onConnect = () => {
  console.log('✅ Connected to Network Rail');
  stompClient.subscribe('/topic/TD_ALL_SIG_AREA', (message) => handleTDMessage(message.body));
  stompClient.subscribe('/topic/TRAIN_MVT_ALL_TOC', (message) => handleMovementMessage(message.body));
};

stompClient.onDisconnect = () => console.log('❌ Disconnected');
stompClient.activate();

function unwrapMsg(msg) {
  if (msg && typeof msg === 'object') {
    const keys = Object.keys(msg);
    for (const k of keys) {
      if (k.endsWith('_MSG')) {
        return { msgType: k.replace('_MSG', ''), inner: msg[k] };
      }
    }
  }
  return null;
}

function handleTDMessage(body) {
  try {
    lastRawTdBodies.push(body);
    if (lastRawTdBodies.length > 3) lastRawTdBodies.shift();

    const msgs = JSON.parse(body);
    if (!Array.isArray(msgs)) return;

    msgs.forEach(msg => {
      const unwrapped = unwrapMsg(msg);
      let msgType, b;

      if (unwrapped) {
        msgType = unwrapped.msgType;
        b = unwrapped.inner;
      } else {
        const h = msg.header || msg;
        b = msg.body || msg;
        msgType = h.msg_type || b.msg_type;
      }

      if (!msgType || !b) return;
      const area = b.area_id;

      if ((msgType === 'CA' || msgType === 'CC') && b.to && b.descr) {
        const toBerth = b.to;
        const trainId = b.descr;
        const loc = lookupBerth(area, toBerth);
        const coords = loc || stationCoords.VIC;
        console.log('[TD]', msgType, 'id:', trainId, 'area:', area, 'to:', toBerth, '→', loc ? loc.crs : '(unknown)');
        trains.set(trainId, {
          trainId,
          crs: loc ? loc.crs : 'VIC',
          lat: coords.lat,
          lng: coords.lng,
          timestamp: Date.now(),
          area,
          berth: toBerth,
        });
        lastUpdate = Date.now();
      }

      if (msgType === 'CB' && b.from && b.descr) {
        const trainId = b.descr;
        console.log('[TD]', 'CB cancel id:', trainId, 'area:', area, 'from:', b.from);
        trains.delete(trainId);
        lastUpdate = Date.now();
      }

      if (msgType === '0003' && b.train_id) {
        const toBerth = b.to;
        const loc = lookupBerth(area, toBerth);
        const coords = loc || stationCoords.VIC;
        const crs = b.crs || b.location_crs || (loc ? loc.crs : 'VIC');
        console.log('[TD]', 'id:', b.train_id, 'area:', area, 'from:', b.from, 'to:', b.to, 'descr:', b.descr);
        trains.set(b.train_id, { trainId: b.train_id, crs, lat: coords.lat, lng: coords.lng, timestamp: Date.now() });
        lastUpdate = Date.now();
      }
    });
  } catch (e) {
    console.error('[TD]', e.message);
  }
}

function handleMovementMessage(body) {
  try {
    const msgs = JSON.parse(body);
    if (!Array.isArray(msgs)) return;
    msgs.forEach(msg => {
      const b = msg.body || msg;
      if (!b.train_id) return;
      const crs = b.crs || b.location_crs;
      const coords = stationCoords[crs] || { lat: 51.5074, lng: -0.1278 };
      console.log('[MVT]', 'id:', b.train_id, 'loc:', b.location_name, 'crs:', crs);
      trains.set(b.train_id, { ...b, trainId: b.train_id, lat: coords.lat, lng: coords.lng, timestamp: Date.now() });
      lastUpdate = Date.now();
    });
  } catch (e) {
    console.error('[MVT]', e.message);
  }
}

app.get('/api/trains', (req, res) => {
  res.json({
    trains: Array.from(trains.values()).map(t => ({
      id: t.trainId,
      location: t.location || t.crs || 'Unknown',
      lat: t.lat,
      lng: t.lng,
      operator: t.toc || 'Unknown',
      service: t.service_description || 'Unknown',
      status: t.status || 'On time',
      timestamp: t.timestamp,
    })),
    timestamp: lastUpdate,
  });
});

app.get('/api/signals', (req, res) => {
  res.json({
    signals: [
      { id: 'SIG001', lat: 51.4975, lng: -0.144, state: 'green', type: 'home', name: 'Victoria West' },
      { id: 'SIG002', lat: 51.475, lng: -0.175, state: 'green', type: 'block', name: 'Clapham Jct' },
      { id: 'SIG003', lat: 51.503, lng: -0.113, state: 'yellow', type: 'home', name: 'Waterloo East' },
      { id: 'SIG004', lat: 51.518, lng: -0.14, state: 'green', type: 'block', name: 'Euston North' },
      { id: 'SIG005', lat: 51.498, lng: -0.052, state: 'red', type: 'home', name: 'Surrey Quays' },
      { id: 'SIG006', lat: 51.507, lng: -0.105, state: 'green', type: 'distant', name: 'London Bridge' },
    ],
    timestamp: Date.now(),
  });
});

app.get('/debug/last-td', (req, res) => {
  res.json({ lastRawTdBodies });
});

app.get('/health', (req, res) =>
  res.json({ status: 'ok', connected: stompClient.active, trainCount: trains.size, lastUpdate, berthMapReady })
);
app.get('/', (req, res) =>
  res.json({
    name: 'Network Rail API',
    endpoints: { trains: '/api/trains', signals: '/api/signals', health: '/health', debug: '/debug/last-td' },
  })
);

// Start up
initBerthMap().then(() => {
  app.listen(PORT, () => console.log('🚂 Server running on port ' + PORT));
});
