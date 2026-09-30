const express = require('express');
const cors = require('cors');
const { Kafka, logLevel } = require('kafkajs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const RDM_KAFKA_BROKERS = (process.env.RDM_KAFKA_BROKERS || 'pkc-z3p1v0.europe-west2.gcp.confluent.cloud:9092')
  .split(',').map((broker) => broker.trim()).filter(Boolean);
const RDM_KAFKA_USERNAME = process.env.RDM_KAFKA_USERNAME;
const RDM_KAFKA_PASSWORD = process.env.RDM_KAFKA_PASSWORD;
const RDM_KAFKA_GROUP_ID = process.env.RDM_KAFKA_GROUP_ID || 'SC-b859ff99-c485-47a4-b812-3d7008c23d7e';
const TD_TOPIC = 'TD_ALL_SIG_AREA';
const MVT_TOPIC = 'TRAIN_MVT_ALL_TOC';

const trains = new Map();
const lastRawTdBodies = [];
const lastRawMvtBodies = [];
let lastUpdate = null;
let lastKafkaMessageAt = null;
let kafkaStatus = 'starting';
let kafkaError = null;
let tdMessageCount = 0;
let mvtMessageCount = 0;
let tdErrorCount = 0;
let mvtErrorCount = 0;

const berthMapPath = path.join(__dirname, 'berth-map.json');
let berthMap = {};
let berthMapStatus = 'loading';
let berthMapError = null;

try {
  const parsed = JSON.parse(fs.readFileSync(berthMapPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !Object.keys(parsed).length) throw new Error('Invalid or empty berth map');
  berthMap = parsed;
  berthMapStatus = 'ready';
  console.log(`Loaded berth-map.json with ${Object.keys(berthMap).length} entries`);
} catch (error) {
  berthMapStatus = 'error';
  berthMapError = error.message;
  console.error('Failed to load berth map:', error.message);
}

function lookupBerth(area, berth) {
  return berthMap[`${area}:${berth}`] || null;
}

function unwrapMessage(message) {
  if (!message || typeof message !== 'object') return null;
  for (const key of Object.keys(message)) {
    if (key.endsWith('_MSG')) return { msgType: key.replace('_MSG', ''), body: message[key] };
  }
  const body = message.body || message;
  const header = message.header || message;
  return { msgType: header.msg_type || body.msg_type, body };
}

function parseJsonArray(value) {
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function upsertTdTrain(body, msgType) {
  if (!body?.area_id || !body?.to || !body?.descr) return;
  const location = lookupBerth(body.area_id, body.to);
  if (!location) return;
  trains.set(body.descr, {
    trainId: body.descr,
    crs: location.crs,
    lat: location.lat,
    lng: location.lng,
    area: body.area_id,
    berth: body.to,
    source: 'TD',
    timestamp: Date.now(),
  });
  lastUpdate = Date.now();
  console.log(`[TD] ${msgType} ${body.descr} ${body.area_id}:${body.to} -> ${location.crs}`);
}

function handleTdPayload(value) {
  lastRawTdBodies.push(value);
  if (lastRawTdBodies.length > 3) lastRawTdBodies.shift();
  for (const message of parseJsonArray(value)) {
    const event = unwrapMessage(message);
    if (!event?.msgType || !event.body) continue;
    tdMessageCount++;
    if (event.msgType === 'CA' || event.msgType === 'CC') upsertTdTrain(event.body, event.msgType);
    if (event.msgType === 'CB' && event.body.descr) {
      trains.delete(event.body.descr);
      lastUpdate = Date.now();
      console.log(`[TD] CB removed ${event.body.descr}`);
    }
  }
}

function handleMvtPayload(value) {
  lastRawMvtBodies.push(value);
  if (lastRawMvtBodies.length > 3) lastRawMvtBodies.shift();
  for (const message of parseJsonArray(value)) {
    const body = message.body || message;
    const trainId = body.train_id || body.trainId;
    if (!trainId) continue;
    const lat = Number(body.latitude ?? body.lat);
    const lng = Number(body.longitude ?? body.lng ?? body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    mvtMessageCount++;
    trains.set(trainId, {
      ...body,
      trainId,
      lat,
      lng,
      source: 'MVT',
      timestamp: Date.now(),
    });
    lastUpdate = Date.now();
    console.log(`[MVT] ${trainId} lat=${lat} lng=${lng}`);
  }
}

async function startKafka() {
  if (!RDM_KAFKA_USERNAME || !RDM_KAFKA_PASSWORD) {
    kafkaStatus = 'error';
    kafkaError = 'RDM_KAFKA_USERNAME or RDM_KAFKA_PASSWORD is not set';
    console.error(kafkaError);
    return;
  }

  const kafka = new Kafka({
    clientId: 'uk-live-train-map',
    brokers: RDM_KAFKA_BROKERS,
    ssl: true,
    sasl: {
      mechanism: 'plain',
      username: RDM_KAFKA_USERNAME,
      password: RDM_KAFKA_PASSWORD,
    },
    logLevel: logLevel.NOTHING,
  });

  const consumer = kafka.consumer({ groupId: RDM_KAFKA_GROUP_ID, allowAutoTopicCreation: false });
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: TD_TOPIC, fromBeginning: false });
    await consumer.subscribe({ topic: MVT_TOPIC, fromBeginning: false });
    kafkaStatus = 'connected';
    kafkaError = null;
    console.log(`Connected to RDM Kafka; consuming ${TD_TOPIC} and ${MVT_TOPIC}`);

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const value = message.value ? message.value.toString('utf8') : '';
          if (!value) return;
          lastKafkaMessageAt = Date.now();
          if (topic === TD_TOPIC) {
            handleTdPayload(value);
          } else if (topic === MVT_TOPIC) {
            handleMvtPayload(value);
          }
        } catch (error) {
          console.error(`[Kafka ${topic}]`, error.message);
          if (topic === TD_TOPIC) tdErrorCount++;
          if (topic === MVT_TOPIC) mvtErrorCount++;
        }
      },
    });
  } catch (error) {
    kafkaStatus = 'error';
    kafkaError = error.message;
    console.error('Kafka connection failed:', error.message);
  }
}

app.get('/api/trains', (req, res) => {
  res.json({
    trains: Array.from(trains.values()).map((train) => ({
      id: train.trainId,
      location: train.location || train.crs || 'Unknown',
      lat: train.lat,
      lng: train.lng,
      operator: train.toc || train.operator || 'Unknown',
      service: train.service_description || train.service || 'Unknown',
      status: train.status || 'On time',
      source: train.source,
      timestamp: train.timestamp,
    })),
    timestamp: lastUpdate,
  });
});

app.get('/api/signals', (req, res) => res.json({ signals: [], timestamp: Date.now() }));
app.get('/debug/last-td', (req, res) => res.json({ lastRawTdBodies }));
app.get('/debug/last-mvt', (req, res) => res.json({ lastRawMvtBodies }));
app.get('/debug/stats', (req, res) => res.json({
  trainCount: trains.size,
  tdMessageCount,
  mvtMessageCount,
  tdErrorCount,
  mvtErrorCount,
  lastKafkaMessageAt,
  lastUpdate,
}));
app.get('/health', (req, res) => res.json({
  status: 'ok',
  kafkaStatus,
  kafkaError,
  brokers: RDM_KAFKA_BROKERS,
  groupId: RDM_KAFKA_GROUP_ID,
  topics: [TD_TOPIC, MVT_TOPIC],
  lastKafkaMessageAt,
  trainCount: trains.size,
  lastUpdate,
  berthMapStatus,
  berthMapError,
}));
app.get('/', (req, res) => res.json({
  name: 'RDM Network Rail API',
  endpoints: { trains: '/api/trains', signals: '/api/signals', health: '/health', debug: { lastTd: '/debug/last-td', lastMvt: '/debug/last-mvt', stats: '/debug/stats' } },
}));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
startKafka();
