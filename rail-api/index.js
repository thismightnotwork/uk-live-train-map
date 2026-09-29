const express = require('express');
const cors = require('cors');
const { Client } = require('@stomp/stompjs');
const WebSocket = require('websocket');
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
    const msgs = JSON.parse(body);
    if (Array.isArray(msgs)) {
      msgs.forEach(msg => {
        if (msg.header?.msg_type === '0003' && msg.body?.train_id) {
          trains.set(msg.body.train_id, { trainId: msg.body.train_id, berth: msg.body.current_berth, timestamp: Date.now() });
          lastUpdate = Date.now();
        }
      });
    }
  } catch (e) { console.error('[TD]', e.message); }
}

function handleMovementMessage(body) {
  try {
    const msgs = JSON.parse(body);
    if (Array.isArray(msgs)) {
      msgs.forEach(msg => {
        if (msg.body?.train_id) {
          trains.set(msg.body.train_id, { ...msg.body, trainId: msg.body.train_id, timestamp: Date.now() });
          lastUpdate = Date.now();
        }
      });
    }
  } catch (e) { console.error('[MVT]', e.message); }
}

app.get('/api/trains', (req, res) => {
  res.json({ trains: Array.from(trains.values()).map(t => ({
    id: t.trainId, location: t.location || t.berth || 'Unknown',
    lat: t.latitude || 51.5074, lng: t.longitude || -0.1278,
    operator: t.toc || 'Unknown', service: t.service_description || 'Unknown',
    status: t.status || 'On time', timestamp: t.timestamp
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

app.get('/health', (req, res) => res.json({ status: 'ok', connected: stompClient.active, trainCount: trains.size, lastUpdate }));
app.get('/', (req, res) => res.json({ name: 'Network Rail API', endpoints: { trains: '/api/trains', signals: '/api/signals', health: '/health' } }));
app.listen(PORT, () => console.log('🚂 Server on port ' + PORT));
