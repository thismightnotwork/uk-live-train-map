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

const berthMapPath = path.join(__dirname, 'berth-map.json');
let berthMap = {};
let berthMapStatus = 'loading';
let berthMapError = null;

const stationCoords = {
  VIC: { lat: 51.4952, lng: -0.1441 }, LBG: { lat: 51.5065, lng: -0.0856 },
  WAT: { lat: 51.5031, lng: -0.1132 }, LST: { lat: 51.5180, lng: -0.0817 },
  PAD: { lat: 51.5154, lng: -0.1755 }, EUS: { lat: 51.5282, lng: -0.1337 },
  KGX: { lat: 51.5308, lng: -0.1238 }, LIV: { lat: 51.5178, lng: -0.0823 },
  CLJ: { lat: 51.4640, lng: -0.1700 }, SQY: { lat: 51.4980, lng: -0.0520 },
};

function lookupBerth(area, berth) { return berthMap[`${area}:${berth}`] || null; }

function fetchAuthenticatedJSONFollowRedirects(url) {
  return new Promise((resolve, reject) => {
    const auth = 'Basic ' + Buffer.from(`${NR_USERNAME}:${NR_PASSWORD}`).toString('base64');
    function requestWithRedirect(u, redirectCount = 0) {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      https.get(u, { headers: { Authorization: auth }, timeout: 15000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) {
          const location = res.headers.location;
          if (!location) return reject(new Error('Redirect without Location header'));
          res.resume();
          return requestWithRedirect(location, redirectCount + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (err) { reject(err); }
        });
      }).on('error', reject);
    }
    requestWithRedirect(url);
  });
}

async function buildBerthMap() {
  if (!NR_USERNAME || !NR_PASSWORD) throw new Error('NR_USERNAME or NR_PASSWORD not set');
  const [smart, corpus] = await Promise.all([
    fetchAuthenticatedJSONFollowRedirects('https://publicdatafeeds.networkrail.co.uk/ntrod/SupportingFileAuthenticate?type=SMART'),
    fetchAuthenticatedJSONFollowRedirects('https://publicdatafeeds.networkrail.co.uk/ntrod/SupportingFileAuthenticate?type=CORPUS'),
  ]);
  const tiplocToCrs = {};
  if (Array.isArray(corpus)) for (const row of corpus) {
    const tiploc = row.TIPLOC || row.tiploc;
    const crs = row.CRS || row.crs;
    if (tiploc && crs) tiplocToCrs[tiploc] = crs;
  }
  const newMap = {};
  if (Array.isArray(smart)) for (const row of smart) {
    const area = row.AREA || row.area;
    const berth = row.BERTH || row.berth;
    let crs = row.CRS || row.crs;
    const tiploc = row.TIPLOC || row.tiploc;
    if (!area || !berth) continue;
    if (!crs && tiploc) crs = tiplocToCrs[tiploc];
    const coords = stationCoords[crs];
    if (crs && coords) newMap[`${area}:${berth}`] = { crs, ...coords };
  }
  if (!Object.keys(newMap).length) throw new Error('No valid berth mappings produced');
  berthMap = newMap;
  fs.writeFileSync(berthMapPath, JSON.stringify(berthMap, null, 2));
  berthMapStatus = 'ready';
  console.log('Built berth map with', Object.keys(berthMap).length, 'entries');
}

(async () => {
  try {
    if (fs.existsSync(berthMapPath)) {
      const cached = JSON.parse(fs.readFileSync(berthMapPath, 'utf8'));
      if (cached && Object.keys(cached).length > 100) {
        berthMap = cached;
        berthMapStatus = 'ready';
        return;
      }
    }
    await buildBerthMap();
  } catch (err) {
    berthMapStatus = 'error';
    berthMapError = err.message;
    console.error('Failed to build berth map:', err.message);
  }
})();

global.WebSocket = WebSocket.w3cwebsocket;
const stompClient = new Client({
  brokerURL: `ws://${NR_HOST}:${NR_PORT}/ws`,
  connectHeaders: { login: NR_USERNAME, passcode: NR_PASSWORD },
  debug: (str) => console.log('[STOMP]', str),
  reconnectDelay: 5000,
});

stompClient.onConnect = () => {
  console.log('Connected to Network Rail');
  stompClient.subscribe('/topic/TD_ALL_SIG_AREA', (message) => handleTDMessage(message.body));
  stompClient.subscribe('/topic/TRAIN_MVT_ALL_TOC', (message) => handleMovementMessage(message.body));
};
stompClient.onDisconnect = () => console.log('Disconnected');
stompClient.activate();

function unwrapMsg(msg) {
  if (!msg || typeof msg !== 'object') return null;
  for (const key of Object.keys(msg)) {
    if (key.endsWith('_MSG')) return { msgType: key.replace('_MSG', ''), inner: msg[key] };
  }
  return null;
}

function handleTDMessage(body) {
  try {
    lastRawTdBodies.push(body);
    if (lastRawTdBodies.length > 3) lastRawTdBodies.shift();
    const messages = JSON.parse(body);
    if (!Array.isArray(messages)) return;
    for (const message of messages) {
      const wrapped = unwrapMsg(message);
      const b = wrapped ? wrapped.inner : (message.body || message);
      const msgType = wrapped ? wrapped.msgType : ((message.header || message).msg_type || b.msg_type);
      if (!msgType || !b) continue;
      const area = b.area_id;
      if ((msgType === 'CA' || msgType === 'CC') && b.to && b.descr) {
        const loc = lookupBerth(area, b.to);
        if (!loc) continue;
        trains.set(b.descr, { trainId: b.descr, crs: loc.crs, lat: loc.lat, lng: loc.lng, timestamp: Date.now(), area, berth: b.to });
        lastUpdate = Date.now();
      } else if (msgType === 'CB' && b.descr) {
        trains.delete(b.descr);
        lastUpdate = Date.now();
      }
    }
  } catch (err) { console.error('[TD]', err.message); }
}

function handleMovementMessage(body) {
  try {
    const messages = JSON.parse(body);
    if (!Array.isArray(messages)) return;
    for (const message of messages) {
      const b = message.body || message;
      if (!b.train_id) continue;
      const crs = b.crs || b.location_crs;
      const coords = stationCoords[crs];
      if (!coords) continue;
      trains.set(b.train_id, { ...b, trainId: b.train_id, ...coords, timestamp: Date.now() });
      lastUpdate = Date.now();
    }
  } catch (err) { console.error('[MVT]', err.message); }
}

app.get('/api/trains', (req, res) => res.json({
  trains: Array.from(trains.values()).map((t) => ({
    id: t.trainId, location: t.location || t.crs || 'Unknown', lat: t.lat, lng: t.lng,
    operator: t.toc || 'Unknown', service: t.service_description || 'Unknown', status: t.status || 'On time', timestamp: t.timestamp,
  })), timestamp: lastUpdate,
}));
app.get('/api/signals', (req, res) => res.json({ signals: [], timestamp: Date.now() }));
app.get('/debug/last-td', (req, res) => res.json({ lastRawTdBodies }));
app.get('/health', (req, res) => res.json({ status: 'ok', connected: stompClient.active, trainCount: trains.size, lastUpdate, berthMapStatus, berthMapError }));
app.get('/', (req, res) => res.json({ name: 'Network Rail API', endpoints: { trains: '/api/trains', signals: '/api/signals', health: '/health', debug: '/debug/last-td' } }));
app.listen(PORT, () => console.log('Server running on port ' + PORT));
