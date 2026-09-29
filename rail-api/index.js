const express = require('express');
const cors = require('cors');
const { Client } = require('stompjs');
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
const signals = new Map();
let lastUpdate = null;

const stompClient = new Client({
  brokerURL: `ws://${NR_HOST}:${NR_PORT}/ws`,
  connectHeaders: {
    login: NR_USERNAME,
    passcode: NR_PASSWORD,
  },
  debug: (str) => console.log('[STOMP]', str),
  reconnectDelay: 5000,
});

stompClient.onConnect = () => {
  console.log('✅ Connected to Network Rail');
  
  stompClient.subscribe('/topic/TD_ALL_SIG_AREA', (message) => {
    handleTDMessage(message.body);
  });
  
  stompClient.subscribe('/topic/TRAIN_MOVEMENT_ALL', (message) => {
    handleMovementMessage(message.body);
  });
};

stompClient.onDisconnect = () => {
  console.log('❌ Disconnected from Network Rail');
};

stompClient.activate();

function handleTDMessage(body) {
  try {
    const data = JSON.parse(body);
    if (data.trainId && data.berth) {
      trains.set(data.trainId, {
        ...data,
        timestamp: Date.now()
      });
      lastUpdate = Date.now();
    }
  } catch (e) {
    console.error('Error parsing TD message:', e.message);
  }
}

function handleMovementMessage(body) {
  try {
    const data = JSON.parse(body);
    if (data.trainId && data.locationName) {
      trains.set(data.trainId, {
        ...data,
        timestamp: Date.now()
      });
      lastUpdate = Date.now();
    }
  } catch (e) {
    console.error('Error parsing MOVEMENT message:', e.message);
  }
}

app.get('/api/trains', (req, res) => {
  const trainList = Array.from(trains.values()).map(train => ({
    id: train.trainId,
    location: train.locationName || train.berth,
    lat: train.latitude || 51.5074,
    lng: train.longitude || -0.1278,
    operator: train.operator,
    service: train.serviceDescription || `${train.origin} → ${train.destination}`,
    status: train.status || 'On time',
    timestamp: train.timestamp
  }));
  
  res.json({
    trains: trainList,
    timestamp: lastUpdate
  });
});

app.get('/api/signals', (req, res) => {
  const demoSignals = [
    { id: 'SIG001', lat: 51.4975, lng: -0.1440, state: 'green', type: 'home', name: 'Victoria West' },
    { id: 'SIG002', lat: 51.4750, lng: -0.1750, state: 'green', type: 'block', name: 'Clapham Jct' },
    { id: 'SIG003', lat: 51.5030, lng: -0.1130, state: 'yellow', type: 'home', name: 'Waterloo East' },
    { id: 'SIG004', lat: 51.5180, lng: -0.1400, state: 'green', type: 'block', name: 'Euston North' },
    { id: 'SIG005', lat: 51.4980, lng: -0.0520, state: 'red', type: 'home', name: 'Surrey Quays' },
    { id: 'SIG006', lat: 51.5070, lng: -0.1050, state: 'green', type: 'distant', name: 'London Bridge' },
  ];
  
  res.json({
    signals: demoSignals,
    timestamp: Date.now()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connected: stompClient.active,
    trainCount: trains.size,
    lastUpdate
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Network Rail API',
    endpoints: {
      trains: '/api/trains',
      signals: '/api/signals',
      health: '/health'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚂 Server running on port ${PORT}`);
  console.log(`📡 Connected to ${NR_HOST}:${NR_PORT}`);
});
