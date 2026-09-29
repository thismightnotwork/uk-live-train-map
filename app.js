// UK Live Train Map - Using Render Backend API
const API_BASE = 'https://uk-live-train-map.onrender.com';

let map;
let trainsLayer;
let signalsLayer;
let trainMarkers = {};
let signalMarkers = {};

function initMap() {
  map = L.map('map').setView([51.5074, -0.1278], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  trainsLayer = L.layerGroup().addTo(map);
  signalsLayer = L.layerGroup().addTo(map);
  fetchTrains();
  fetchSignals();
  setInterval(() => { fetchTrains(); fetchSignals(); }, 30000);
}

async function fetchTrains() {
  try {
    const response = await fetch(`${API_BASE}/api/trains`);
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
        const marker = L.marker([train.lat, train.lng], { icon: getTrainIcon(train.heading || 0) }).bindPopup(getTrainPopup(train));
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
    const response = await fetch(`${API_BASE}/api/signals`);
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
        const marker = L.circleMarker([signal.lat, signal.lng], { radius: 12, fillColor: getSignalColor(signal.state), color: '#1f2937', weight: 3, fillOpacity: 1.0 }).bindPopup(getSignalPopup(signal));
        marker.addTo(signalsLayer);
        newSignalMarkers[signal.id] = marker;
      }
    });
    Object.keys(signalMarkers).forEach(id => { if (!newSignalMarkers[id]) signalsLayer.removeLayer(signalMarkers[id]); });
    signalMarkers = newSignalMarkers;
  } catch (error) { console.error('Failed to fetch signals:', error); }
}

function getTrainIcon(heading) {
  return L.divIcon({
    html: `<div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:24px solid #2563eb;transform:rotate(${heading}deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));"></div>`,
    className: 'train-marker', iconSize: [24, 24], iconAnchor: [12, 12]
  });
}

function getSignalColor(state) {
  const colors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };
  return colors[state] || '#999';
}

function getTrainPopup(train) {
  return `<div class="train-popup"><h3>🚂 ${train.id}</h3><p><strong>Location:</strong> ${train.location || 'Unknown'}</p><p><strong>Operator:</strong> ${train.operator || 'Unknown'}</p><p><strong>Service:</strong> ${train.service || 'Unknown'}</p><p><strong>Status:</strong> ${train.status || 'On time'}</p></div>`;
}

function getSignalPopup(signal) {
  return `<div class="signal-popup"><h3>🚦 ${signal.name}</h3><p><strong>ID:</strong> ${signal.id}</p><p><strong>Type:</strong> ${signal.type}</p><p><strong>State:</strong> <span style="color: ${getSignalColor(signal.state)}; font-weight: bold;">${signal.state.toUpperCase()}</span></p></div>`;
}

document.addEventListener('DOMContentLoaded', initMap);
