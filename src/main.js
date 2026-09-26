import './style.css';
import L from 'leaflet';
import { createMap } from './lib/map.js';
import { getLiveTrains } from './lib/api.js';
import { normaliseRoute } from './lib/routes.js';
import { signalIcon, aspectLabel } from './lib/signals.js';

const status = document.querySelector('#status');
const panelContent = document.querySelector('#panelContent');
const refreshButton = document.querySelector('#refreshButton');
const locateButton = document.querySelector('#locateButton');
const { map, trainLayer, routeLayer, signalLayer, makeTrainMarker } = createMap();
let trains = [];
let selectedId = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&','<':'<','>':'>','"':'"',"'":'&#039;'}[c]));
const ago = (value) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  return Number.isFinite(s) ? (s < 60 ? `Updated ${s}s ago` : `Updated ${Math.round(s / 60)}m ago`) : 'Update time unknown';
};

function renderList() {
  const list = document.querySelector('#trainList');
  list.innerHTML = trains.slice(0, 100).map((t) =>
    `<button class="train-row ${t.id === selectedId ? 'selected' : ''}" data-id="${esc(t.id)}">` +
    `<strong>${esc(t.headcode || 'Train')}</strong>` +
    `<span>${esc(t.origin || 'Unknown')} → ${esc(t.destination || 'Unknown')}</span>` +
    `<small>${esc(t.operator || 'Operator unknown')} · ${ago(t.updatedAt)}</small></button>`
  ).join('') || '<p class="muted">No train positions returned.</p>';
  list.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => selectTrain(b.dataset.id)));
}

function renderDetails(t) {
  const signals = Array.isArray(t.signals) ? t.signals : [];
  panelContent.innerHTML =
    `<button id="backButton" class="back-button">← All live services</button>` +
    `<h2>${esc(t.headcode || 'Train')}</h2>` +
    `<p class="journey">${esc(t.origin || 'Unknown origin')} <span>→</span> ${esc(t.destination || 'Unknown destination')}</p>` +
    `<dl class="details">` +
    `<div><dt>Operator</dt><dd>${esc(t.operator || 'Unknown')}</dd></div>` +
    `<div><dt>Last update</dt><dd>${ago(t.updatedAt)}</dd></div>` +
    `<div><dt>Position</dt><dd>${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}</dd></div></dl>` +
    `<h3>Signals on route</h3><p class="muted">Live aspects require an authorised feed.</p>` +
    `<div class="signal-list">` +
    (signals.length ? signals.map((s) =>
      `<div class="signal-row"><i class="signal-dot ${String(s.aspect || 'unknown').toLowerCase()}"></i>` +
      `<span><strong>${esc(s.name || s.id || 'Signal')}</strong><small>${esc(aspectLabel(s.aspect))}</small></span></div>`
    ).join('') : '<p class="muted">No signal geometry supplied.</p>') +
    `</div>`;
  document.querySelector('#backButton').addEventListener('click', () => { selectedId = null; draw(); });
}

function draw() {
  trainLayer.clearLayers();
  routeLayer.clearLayers();
  signalLayer.clearLayers();
  trains.forEach((t) => {
    const m = makeTrainMarker(t, t.id === selectedId);
    m.on('click', () => selectTrain(t.id));
    m.addTo(trainLayer);
  });
  if (!selectedId) return renderList();
  const t = trains.find((x) => x.id === selectedId);
  if (!t) { selectedId = null; return draw(); }
  const route = normaliseRoute(t.route, t);
  if (route.length > 1) L.polyline(route, { color: '#49c6ff', weight: 5, opacity: 0.9 }).addTo(routeLayer);
  (t.signals || []).filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))).forEach((s) =>
    L.marker([s.lat, s.lng], { icon: signalIcon(s.aspect) })
      .bindTooltip(`${s.name || s.id || 'Signal'}: ${aspectLabel(s.aspect)}`)
      .addTo(signalLayer)
  );
  renderDetails(t);
}

function selectTrain(id) {
  selectedId = id;
  const t = trains.find((x) => x.id === id);
  if (!t) return;
  const route = normaliseRoute(t.route, t);
  map.fitBounds(route.length > 1 ? route : [[t.latitude, t.longitude]], { padding: [40, 40], maxZoom: 13 });
  draw();
}

async function refresh() {
  refreshButton.disabled = true;
  status.textContent = 'Loading positions…';
  try {
    trains = await getLiveTrains();
    status.textContent = `${trains.length.toLocaleString()} services · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (selectedId && !trains.some((t) => t.id === selectedId)) selectedId = null;
    draw();
  } catch (e) {
    status.textContent = `Unable to load data: ${e.message}`;
    trains = [];
    draw();
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', refresh);
locateButton.addEventListener('click', () => map.locate({ setView: true, maxZoom: 12 }));
map.on('locationerror', () => { status.textContent = 'Location unavailable; showing UK map.'; });
refresh();
setInterval(refresh, 30000);
