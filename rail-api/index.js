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

const berthCoords = {
  'VC01': { lat: 51.4975, lng: -0.1440 },
  'VC02': { lat: 51.4960, lng: -0.1420 },
  'VC03': { lat: 51.4945, lng: -0.1400 },
  'CJ01': { lat: 51.4750, lng: -0.1750 },
  'CJ02': { lat: 51.4730, lng: -0.1720 },
  'LB01': { lat: 51.5070, lng: -0.1050 },
  'LB02': { lat: 51.5050, lng: -0.1020 },
  'SQ01': { lat: 51.4980, lng: -0.0520 },
  'WA01': { lat: 51.5030, lng: -0.1130 },
  'WA02': { lat: 51.5015, lng: -0.1100 },
  'BP01': { lat: 51.4890, lng: -0.1320 },
  'EU01': { lat: 51.5180, lng: -0.1400 },
  'EU02': { lat: 51.5200, lng: -0.1380 },
  'PA01': { lat: 51.5150, lng: -0.1750 },
  'PA02': { lat: 51.5165, lng: -0.1720 },
  'KG01': { lat: 51.5320, lng: -0.1230 },
  'KG02': { lat: 51.5340, lng: -0.1200 },
  'LS01': { lat: 51.5180, lng: -0.0820 },
  'LS02': { lat: 51.5195, lng: -0.0790 },
};

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

function getCoordsForBerth(berth) {
  if (!berth) return null;
  if (berthCoords[berth]) return berthCoords[berth];
  const prefix = berth.substring(0, 4);
  if (berthCoords[prefix]) return berthCoords[prefix];
  return null;
}

function handleTDMessage(body) {
  try {
    const msgs = JSON.parse(body);
    if (Array.isArray(msgs)) {
      msgs.forEach(msg => {
        if (msg.header?.msg_type === '0003' && msg.body?.train_id) {
          const trainId = msg.body.train_id;
          const berth = msg.body.current_berth;
          let coords = getCoordsForBerth(berth);
          if (!coords && msg.body.crs) coords = stationCoords[msg.body.crs];
          if (!coords) coords = { lat: 51.5074, lng: -0.1278 };
          
          trains.set(trainId, { trainId, berth, crs: msg.body.crs, lat: coords.lat, lng: coords.lng, timestamp: Date.now() });
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
          const trainId = msg.body.train_id;
          const crs = msg.body.crs;
          let coords = stationCoords[crs] || { lat: 51.5074, lng: -0.1278 };
          trains.set(trainId, { ...msg.body, trainId, lat: coords.lat, lng: coords.lng, timestamp: Date.now() });
          lastUpdate = Date.now();
        }
      });
    }
  } catch (e) { console.error('[MVT]', e.message); }
}

app.get('/api/trains', (req, res) => {
  res.json({ trains: Array.from(trains.values()).map(t => ({
    id: t.trainId, location: t.location || t.berth || 'Unknown',
    lat: t.lat, lng: t.lng, operator: t.toc || 'Unknown',
    service: t.service_description || 'Unknown', status: t.status || 'On time', timestamp: t.timestamp
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

app.get('/', (req, res) => res.send(getMapHTML()));

function getMapHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UK Live Train Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #map { height: 100vh; width: 100%; }
    .legend {
      position: fixed; bottom: 20px; right: 20px; background: white;
      padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000; font-size: 13px;
    }
    .legend-item { display: flex; align-items: center; margin: 5px 0; }
    .legend-color { width: 20px; height: 20px; border-radius: 50%; margin-right: 10px; }
    .train-icon { background: #2563eb; }
    .signal-green { background: #22c55e; }
    .signal-yellow { background: #eab308; }
    .signal-red { background: #ef4444; }
    .status-bar {
      position: fixed; top: 0; left: 0; right: 0; background: white;
      padding: 10px 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      z-index: 1000; display: flex; justify-content: space-between; align-items: center;
    }
    .train-count { font-weight: 600; color: #2563eb; }
    .last-update { color: #666; font-size: 13px; }
    .train-popup { min-width: 200px; }
    .train-popup h3 { margin-bottom: 8px; color: #1e40af; font-size: 14px; }
    .train-popup p { margin: 4px 0; font-size: 12px; }
    .signal-popup { min-width: 160px; }
    .signal-popup h3 { margin-bottom: 6px; color: #1e40af; font-size: 13px; }
    .signal-popup p { margin: 3px 0; font-size: 12px; }
  </style>
</head>
<body>
  <div class="status-bar">
    <div>
      <span class="train-count" id="trainCount">0</span> trains live
      <span style="margin: 0 10px;">|</span>
      <span id="signalCount">0</span> signals
    </div>
    <div class="last-update" id="lastUpdate">Updating...</div>
  </div>
  
  <div id="map"></div>
  
  <div class="legend">
    <div class="legend-item"><div class="legend-color train-icon"></div><span>Train</span></div>
    <div class="legend-item"><div class="legend-color signal-green"></div><span>Signal Green</span></div>
    <div class="legend-item"><div class="legend-color signal-yellow"></div><span>Signal Yellow</span></div>
    <div class="legend-item"><div class="legend-color signal-red"></div><span>Signal Red</span></div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([51.5074, -0.1278], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let trainsLayer = L.layerGroup().addTo(map);
    let signalsLayer = L.layerGroup().addTo(map);
    let trainMarkers = {};
    let signalMarkers = {};

    function getTrainIcon(heading) {
      return L.divIcon({
        html: \`<div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:24px solid #2563eb;transform:rotate(\${heading || 0}deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));"></div>\`,
        className: 'train-marker', iconSize: [24, 24], iconAnchor: [12, 12]
      });
    }

    function getSignalIcon(state) {
      const colors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };
      return L.circleMarker([0, 0], {
        radius: 12, fillColor: colors[state] || '#999', color: '#1f2937', weight: 3, fillOpacity: 1.0
      });
    }

    async function fetchTrains() {
      try {
        const response = await fetch('/api/trains');
        const data = await response.json();
        if (data.error) { console.error('Error:', data.error); return; }
        
        document.getElementById('trainCount').textContent = data.trains.length;
        document.getElementById('lastUpdate').textContent = 'Updated: ' + new Date(data.timestamp || Date.now()).toLocaleTimeString();
        
        const newTrainMarkers = {};
        data.trains.forEach(train => {
          if (trainMarkers[train.id]) {
            const marker = trainMarkers[train.id];
            marker.setLatLng([train.lat, train.lng]);
            marker.setIcon(getTrainIcon(train.heading || 0));
            marker.setPopupContent(getTrainPopup(train));
            newTrainMarkers[train.id] = marker;
          } else {
            const marker = L.marker([train.lat, train.lng], { icon: getTrainIcon(train.heading || 0) })
              .bindPopup(getTrainPopup(train));
            marker.addTo(trainsLayer);
            newTrainMarkers[train.id] = marker;
          }
        });
        Object.keys(trainMarkers).forEach(id => { if (!newTrainMarkers[id]) trainsLayer.removeLayer(trainMarkers[id]); });
        trainMarkers = newTrainMarkers;
      } catch (error) { console.error('Failed to fetch trains:', error); }
    }

    async function fetchSignals() {
      try {
        const response = await fetch('/api/signals');
        const data = await response.json();
        if (data.error) { console.error('Error:', data.error); return; }
        
        document.getElementById('signalCount').textContent = data.signals.length;
        
        const newSignalMarkers = {};
        data.signals.forEach(signal => {
          if (signalMarkers[signal.id]) {
            const marker = signalMarkers[signal.id];
            marker.setLatLng([signal.lat, signal.lng]);
            marker.setStyle({ fillColor: getSignalColor(signal.state) });
            marker.setPopupContent(getSignalPopup(signal));
            newSignalMarkers[signal.id] = marker;
          } else {
            const marker = L.circleMarker([signal.lat, signal.lng], {
              radius: 12, fillColor: getSignalColor(signal.state), color: '#1f2937', weight: 3, fillOpacity: 1.0
            }).bindPopup(getSignalPopup(signal));
            marker.addTo(signalsLayer);
            newSignalMarkers[signal.id] = marker;
          }
        });
        Object.keys(signalMarkers).forEach(id => { if (!newSignalMarkers[id]) signalsLayer.removeLayer(signalMarkers[id]); });
        signalMarkers = newSignalMarkers;
      } catch (error) { console.error('Failed to fetch signals:', error); }
    }

    function getSignalColor(state) {
      const colors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };
      return colors[state] || '#999';
    }

    function getTrainPopup(train) {
      return \`<div class="train-popup">
        <h3>🚂 \${train.id}</h3>
        <p><strong>Location:</strong> \${train.location || 'Unknown'}</p>
        <p><strong>Operator:</strong> \${train.operator || 'Unknown'}</p>
        <p><strong>Service:</strong> \${train.service || 'Unknown'}</p>
        <p><strong>Status:</strong> \${train.status || 'On time'}</p>
      </div>\`;
    }

    function getSignalPopup(signal) {
      return \`<div class="signal-popup">
        <h3>🚦 \${signal.name}</h3>
        <p><strong>ID:</strong> \${signal.id}</p>
        <p><strong>Type:</strong> \${signal.type}</p>
        <p><strong>State:</strong> <span style="color: \${getSignalColor(signal.state)}; font-weight: bold;">\${signal.state.toUpperCase()}</span></p>
      </div>\`;
    }

    fetchTrains();
    fetchSignals();
    setInterval(() => { fetchTrains(); fetchSignals(); }, 30000);
  </script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log('🚂 Server running on port ' + PORT);
  console.log('📡 Map: http://localhost:' + PORT);
});
