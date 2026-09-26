import 'leaflet/dist/leaflet.css';
import './style.css';
import { getLiveTrains } from './lib/api.js';
import { createMap, locateUser, renderTrainDetail, renderTrains } from './lib/map.js';

const app = document.querySelector('#app');

function showStartupError(error) {
  console.error('Train map failed to start:', error);
  if (app) {
    app.innerHTML = `<main class="startup-error"><h1>UK Live Train Map</h1><p>The map could not start.</p><pre>${String(error?.message ?? error).replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]))}</pre><button type="button" onclick="location.reload()">Reload</button></main>`;
  }
}

try {
  if (!app) throw new Error('Application container was not found');
  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div><h1>UK Live Train Map</h1><p id="status">Loading trains…</p></div>
        <div class="actions"><button id="refresh" type="button">Refresh</button><button id="locate" type="button">Locate me</button></div>
      </header>
      <section class="content">
        <aside class="services" aria-label="Train services"><h2>Services</h2><div id="service-list"></div></aside>
        <div id="map" role="application" aria-label="Live train map"></div>
      </section>
    </main>`;

  const map = createMap(document.querySelector('#map'));
  let trainLayers = [];
  let detailLayer = null;
  let trains = [];

  function selectTrain(train) {
    if (detailLayer) map.removeLayer(detailLayer);
    trainLayers.forEach((layer) => map.removeLayer(layer));
    detailLayer = renderTrainDetail(map, train);
    map.setView([train.latitude, train.longitude], 15, { animate: true });
    document.querySelectorAll('.service-card').forEach((card) => card.classList.toggle('selected', card.dataset.id === train.id));
  }

  function renderServices() {
    const list = document.querySelector('#service-list');
    list.replaceChildren();
    trains.forEach((train) => {
      const button = document.createElement('button');
      button.className = 'service-card';
      button.dataset.id = train.id;
      button.type = 'button';
      button.innerHTML = `<strong>${train.headcode}</strong><span>${train.origin ?? 'Unknown'} → ${train.destination ?? 'Unknown'}</span><small>${train.operator ?? ''}</small>`;
      button.addEventListener('click', () => selectTrain(train));
      list.appendChild(button);
    });
  }

  async function refresh() {
    const status = document.querySelector('#status');
    status.textContent = 'Loading trains…';
    document.querySelector('#refresh').disabled = true;
    try {
      const result = await getLiveTrains();
      trains = result.trains;
      if (detailLayer) { map.removeLayer(detailLayer); detailLayer = null; }
      trainLayers.forEach((layer) => map.removeLayer(layer));
      trainLayers = renderTrains(map, trains, selectTrain);
      renderServices();
      status.textContent = result.usingDemo ? 'Demo data — live feed unavailable' : `${trains.length} live service${trains.length === 1 ? '' : 's'}`;
    } catch (error) {
      status.textContent = 'Unable to load trains';
      console.error('Train refresh failed:', error);
    } finally {
      document.querySelector('#refresh').disabled = false;
    }
  }

  document.querySelector('#refresh').addEventListener('click', refresh);
  document.querySelector('#locate').addEventListener('click', () => locateUser(map));
  map.on('locationerror', () => { document.querySelector('#status').textContent = 'Location unavailable'; });
  window.addEventListener('resize', () => map.invalidateSize());
  refresh();
} catch (error) {
  showStartupError(error);
}
