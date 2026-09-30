const express = require('express');
const cors = require('cors');
const { Client } = require('@stomp/stompjs');
const WebSocket = require('websocket');
const fs = require('fs');
const path = require('path');
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

// Load berth→location mapping
const berthMapPath = path.join(__dirname, 'berth-map.json');
let berthMap = {};
try {
  berthMap = JSON.parse(fs.readFileSync(berthMapPath, 'utf8'));
  console.log('✅ Loaded berth-map.json with', Object.keys(berthMap).length, 'entries');
} catch (e) {
  console.warn('⚠️ Could not load berth-map.json:', e.message);
}

function lookupBerth(area, berth) {
  const key = `${area}:${berth}`;
  return berthMap[key] || null;
}

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

function handleTDMessage(body) {
  try {
    lastRawTdBodies.push(body);
    if (lastRawTdBodies.length > 3) lastRawTdBodies.shift();

    const msgs = JSON.parse(body);
    if (Array.isArray(msgs)) {
      msgs.forEach(msg => {
        const h = msg.header || msg;
        const b = msg.body || msg;
        const msgType = h.msg_type || b.msg_type;

        // CA/CC messages carry berth steps with location info
        if ((msgType === 'CA' || msgType === 'CC') && b.descr) {
          const area = b.area_id;
          const toBerth = b.to;
          const trainId = b.descr; // headcode used as train ID
          const loc = lookupBerth(area, toBerth);
          const coords = loc || stationCoords.VIC;

          console.log('[TD]', msgType, 'id:', trainId, 'area:', area, 'to:', toBerth, '→', loc ? loc.crs : '(unknown)');

          trains.set(trainId, {
            trainId: trainId,
            crs: loc ? loc.crs : 'VIC',
            lat: coords.lat,
            lng: coords.lng,
            timestamp: Date.now(),
            area,
            berth: toBerth,
          });
          lastUpdate = Date.now();
        }

        // Legacy 0003-style messages (if any)
        if (msgType === '0003' && b.train_id) {
          const area = b.area_id;
          const toBerth = b.to;
          const loc = lookupBerth(area, toBerth);
          const coords = loc || stationCoords.VIC;
          const crs = b.crs || b.location_crs || (loc ? loc.crs : 'VIC');

          console.log('[TD]', 'id:', b.train_id, 'area:', area, 'from:', b.from, 'to:', b.to, 'descr:', b.descr);
          trains.set(b.train_id, {
            trainId: b.train_id,
            crs,
            lat: coords.lat,
            lng: coords.lng,
            timestamp: Date.now(),
          });
          lastUpdate = Date.now();
        }
      });
    }
  } catch (e) {
    console.error('[TD]', e.message);
  }
}

function handleMovementMessage(body) {
  try {
    const msgs = JSON.parse(body);
    if (Array.isArray(msgs)) {
      msgs.forEach(msg => {
        const b = msg.body || msg;
        if (b.train_id) {
          const crs = b.crs || b.location_crs;
          const coords = stationCoords[crs] || { lat: 51.5074, lng: -0.1278 };
          console.log('[MVT]', 'id:', b.train_id, 'loc:', b.location_name, 'crs:', crs);
          trains.set(b.train_id, { ...b, trainId: b.train_id, lat: coords.lat, lng: coords.lng, timestamp: Date.now() });
          lastUpdate = Date.now();
        }
      });
    }
  } catch (e) {
    console.error('[MVT]', e.message);
  }
}

app.get('/api/trains', (req, res) => {
  res.json({ trains: Array.from(trains.values()).map(t => ({
    id: t.trainId,
    location: t.location || t.crs || 'Unknown',
    lat: t.lat,
    lng: t.lng,
    operator: t.toc || 'Unknown',
    service: t.service_description || 'Unknown',
    status: t.status || 'On time',
    timestamp: t.timestamp
  })), timestamp: lastUpdate });
});

app.get('/api/signals', (req, res) => {
  res.json({ signals: [
    { id: 'SIG001', lat: 51.4975, lng: -0.144, state: 'green', type: 'home', name: 'Victoria West' },
    { id: 'SIG002', lat: 51.475, lng: -0.175, state: 'green', type: 'block', name: 'Clapham Jct' },
    { id: 'SIG003', lat: 51.503, lng: -0.113, state: 'yellow', type: 'home', name: 'Waterloo East' },
    { id: 'SIG004', lat: 51.518, lng: -0.14, state: 'green', type: 'block', name: 'Euston North' },
    { id: 'SIG005', lat: 51.498, lng: -0.052, state: 'red', type: 'home', name: 'Surrey Quays' },
    { id: 'SIG006', lat: 51.507, lng: -0.105, state: 'green', type: 'distant', name: 'London Bridge' },
  ], timestamp: Date.now() });
});

app.get('/debug/last-td', (req, res) => {
  res.json({ lastRawTdBodies });
});

app.get('/health', (req, res) => res.json({ status: 'ok', connected: stompClient.active, trainCount: trains.size, lastUpdate }));
app.get('/', (req, res) => res.json({ name: 'Network Rail API', endpoints: { trains: '/api/trains', signals: '/api/signals', health: '/health', debug: '/debug/last-td' } }));

app.listen(PORT, () => console.log('🚂 Server running on port ' + PORT));
