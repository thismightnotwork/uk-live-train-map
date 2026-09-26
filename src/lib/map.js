import L from 'leaflet';

const trainIcon = L.divIcon({ className: 'train-marker', html: '<span>🚆</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
const signalIcon = L.divIcon({ className: 'signal-marker', html: '<span>●</span>', iconSize: [22, 22], iconAnchor: [11, 11] });

export function createMap(container) {
  const map = L.map(container, { zoomControl: false, tap: true }).setView([50.834, -0.18], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
  return map;
}

export function renderTrains(map, trains, onSelect) {
  return trains.map((train) => L.marker([train.latitude, train.longitude], { icon: trainIcon, title: train.headcode }).bindTooltip(train.headcode, { direction: 'top', offset: [0, -14] }).on('click', () => onSelect(train)).addTo(map));
}

export function renderTrainDetail(map, train) {
  const group = L.layerGroup();
  if (train.route.length > 1) L.polyline(train.route.map(({ lat, lng }) => [lat, lng]), { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(group);
  L.marker([train.latitude, train.longitude], { icon: trainIcon }).bindPopup(`<strong>${train.headcode}</strong><br>${train.origin ?? ''} → ${train.destination ?? ''}`).addTo(group);
  train.signals.forEach((signal) => L.marker([signal.lat, signal.lng], { icon: signalIcon }).bindTooltip(`${signal.name}${signal.aspect ? ` (${signal.aspect})` : ''}`).addTo(group));
  group.addTo(map);
  return group;
}

export function locateUser(map) {
  map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true });
}
