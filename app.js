(() => {
  const API_URL = 'https://live-trains.lucafinnisbernard.co.uk/trains?crs=SWK';
  const demo = [
    { id: 'demo-1', headcode: '1A23', latitude: 50.8324, longitude: -0.1788, operator: 'Southern', origin: 'Portsmouth Harbour', destination: 'Brighton', route: [{ lat: 50.819, lng: -0.413 }, { lat: 50.8324, lng: -0.1788 }, { lat: 50.828, lng: -0.141 }], signals: [{ id: 'WS114', name: 'WS114', lat: 50.826, lng: -0.202, aspect: null }] },
    { id: 'demo-2', headcode: '9T42', latitude: 50.8352, longitude: -0.151, operator: 'Thameslink', origin: 'Brighton', destination: 'Bedford', route: [{ lat: 50.828, lng: -0.141 }, { lat: 50.8352, lng: -0.151 }, { lat: 50.846, lng: -0.124 }], signals: [{ id: 'BS201', name: 'BS201', lat: 50.832, lng: -0.146, aspect: 'green' }] }
  ];
  const $ = (id) => document.getElementById(id);
  const point = (value) => {
    if (!value || typeof value !== 'object') return null;
    const lat = Number(value.lat ?? value.latitude);
    const lng = Number(value.lng ?? value.lon ?? value.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };
  const normalise = (train) => {
    const position = point(train);
    if (!position) return null;
    return { ...train, ...position, id: String(train.id ?? train.headcode ?? `${position.lat}-${position.lng}`), headcode: train.headcode ?? 'Unknown', route: Array.isArray(train.route) ? train.route.map(point).filter(Boolean) : [], signals: Array.isArray(train.signals) ? train.signals.map((signal) => { const p = point(signal); return p ? { ...signal, ...p, name: signal.name ?? signal.id ?? 'Signal' } : null; }).filter(Boolean) : [] };
  };
  let map; let markers = []; let detail; let trains = [];
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function trainIcon() { return L.divIcon({ className: 'train-marker', html: '<span>🚆</span>', iconSize: [34, 34], iconAnchor: [17, 17] }); }
  function signalIcon() { return L.divIcon({ className: 'signal-marker', html: '<span>●</span>', iconSize: [22, 22], iconAnchor: [11, 11] }); }
  function selectTrain(train) {
    markers.forEach((marker) => map.removeLayer(marker));
    if (detail) map.removeLayer(detail);
    detail = L.layerGroup();
    if (train.route.length > 1) L.polyline(train.route.map((p) => [p.lat, p.lng]), { color: '#2563eb', weight: 5 }).addTo(detail);
    L.marker([train.latitude, train.longitude], { icon: trainIcon() }).bindPopup(`<b>${escapeHtml(train.headcode)}</b><br>${escapeHtml(train.origin)} → ${escapeHtml(train.destination)}`).addTo(detail);
    train.signals.forEach((signal) => L.marker([signal.lat, signal.lng], { icon: signalIcon() }).bindTooltip(escapeHtml(signal.name)).addTo(detail));
    detail.addTo(map);
    map.setView([train.latitude, train.longitude], 15, { animate: true });
  }
  function render() {
    markers.forEach((marker) => map.removeLayer(marker));
    markers = trains.map((train) => L.marker([train.latitude, train.longitude], { icon: trainIcon(), title: train.headcode }).bindTooltip(train.headcode).on('click', () => selectTrain(train)).addTo(map));
    const list = $('service-list'); list.replaceChildren();
    trains.forEach((train) => { const button = document.createElement('button'); button.className = 'service-card'; button.type = 'button'; button.innerHTML = `<b>${escapeHtml(train.headcode)}</b><span>${escapeHtml(train.origin)} → ${escapeHtml(train.destination)}</span><small>${escapeHtml(train.operator)}</small>`; button.onclick = () => selectTrain(train); list.appendChild(button); });
  }
  async function refresh() {
    $('refresh').disabled = true; $('status').textContent = 'Loading live trains…';
    try {
      const response = await fetch(API_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const raw = Array.isArray(payload) ? payload : payload.trains ?? payload.data ?? [];
      trains = raw.map(normalise).filter(Boolean);
      if (!trains.length) throw new Error('No train positions returned');
      $('status').textContent = `${trains.length} live services`;
    } catch (error) {
      trains = demo.map(normalise);
      $('status').textContent = `Demo data — live feed unavailable (${error.message || 'network/CORS error'})`;
    } finally { render(); $('refresh').disabled = false; }
  }
  function start() {
    map = L.map('map', { zoomControl: false }).setView([50.834, -0.18], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    $('refresh').onclick = refresh;
    $('locate').onclick = () => map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true });
    refresh(); setInterval(refresh, 60000); setTimeout(() => map.invalidateSize(), 100);
  }
  if (window.L) start(); else $('status').textContent = 'Leaflet failed to load';
})();
