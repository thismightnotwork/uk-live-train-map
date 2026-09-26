import L from 'leaflet';

export function createMap() {
  const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([54.3, -2.6], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  const trainLayer = L.layerGroup().addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  const signalLayer = L.layerGroup().addTo(map);
  const makeTrainMarker = (train, selected) =>
    L.marker([train.latitude, train.longitude], {
      icon: L.divIcon({
        className: '',
        html: `<div class="train-marker ${selected ? 'selected' : ''}"><span>➤</span></div>`,
        iconSize: [29, 29],
        iconAnchor: [14, 14],
      }),
      title: `${train.headcode || 'Train'}: ${train.origin || ''} to ${train.destination || ''}`,
    });
  return { map, trainLayer, routeLayer, signalLayer, makeTrainMarker };
}
