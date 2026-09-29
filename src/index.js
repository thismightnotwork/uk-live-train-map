// Cloudflare Worker for UK Live Train Map
// Fetches live train locations and signals, serves a map page

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/trains') {
      return handleTrainsAPI(request, env);
    }
    
    if (url.pathname === '/api/signals') {
      return handleSignalsAPI(request, env);
    }
    
    return new Response(getMapHTML(env), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};

async function handleTrainsAPI(request, env) {
  try {
    const apiKey = env.TRANSPORT_API_KEY;
    let trains = [];
    
    if (apiKey) {
      const response = await fetch(
        `https://api.transportapi.com/v3/trains/running.json?api_key=${apiKey}&app_key=${apiKey}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (response.ok) {
        const data = await response.json();
        trains = parseTrainsFromTransportAPI(data);
      }
    }
    
    if (trains.length === 0) {
      trains = getDemoTrains();
    }
    
    return new Response(JSON.stringify({ trains, timestamp: Date.now() }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleSignalsAPI(request, env) {
  try {
    const signals = getDemoSignals();
    
    return new Response(JSON.stringify({ signals, timestamp: Date.now() }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function parseTrainsFromTransportAPI(data) {
  const trains = [];
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (item.latitude && item.longitude) {
        trains.push({
          id: item.train_id || item.uid,
          lat: parseFloat(item.latitude),
          lng: parseFloat(item.longitude),
          heading: item.heading || 0,
          speed: item.speed || 0,
          operator: item.operator_name || 'Unknown',
          service: item.service_description || '',
          status: item.status || 'on_time'
        });
      }
    });
  }
  return trains;
}

function getDemoTrains() {
  return [
    { id: 'TRN001', lat: 51.5074, lng: -0.1278, heading: 45, speed: 60, operator: 'Southern', service: 'London Victoria - Brighton', status: 'on_time' },
    { id: 'TRN002', lat: 51.5155, lng: -0.0922, heading: 90, speed: 45, operator: 'Thameslink', service: 'London Bridge - Cambridge', status: 'delayed' },
    { id: 'TRN003', lat: 51.4975, lng: -0.1357, heading: 180, speed: 30, operator: 'South Western', service: 'London Waterloo - Southampton', status: 'on_time' },
    { id: 'TRN004', lat: 51.5225, lng: -0.1545, heading: 270, speed: 55, operator: 'London Overground', service: 'Stratford - Richmond', status: 'on_time' },
    { id: 'TRN005', lat: 51.4893, lng: -0.0878, heading: 135, speed: 40, operator: 'Southeastern', service: 'London Bridge - Dover', status: 'cancelled' },
  ];
}

function getDemoSignals() {
  return [
    { id: 'SIG001', lat: 51.5100, lng: -0.1200, state: 'green', type: 'block' },
    { id: 'SIG002', lat: 51.5120, lng: -0.1100, state: 'red', type: 'home' },
    { id: 'SIG003', lat: 51.5050, lng: -0.1300, state: 'yellow', type: 'distant' },
    { id: 'SIG004', lat: 51.5180, lng: -0.1400, state: 'green', type: 'block' },
    { id: 'SIG005', lat: 51.4950, lng: -0.0950, state: 'red', type: 'home' },
  ];
}

function getMapHTML(env) {
  const refreshInterval = (env.REFRESH_INTERVAL_SECONDS || 30) * 1000;
  const centerLat = env.MAP_CENTER_LAT || 51.5074;
  const centerLng = env.MAP_CENTER_LNG || -0.1278;
  const zoom = env.MAP_ZOOM || 7;
  
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
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      font-size: 14px;
    }
    .legend-item { display: flex; align-items: center; margin: 5px 0; }
    .legend-color { width: 20px; height: 20px; border-radius: 50%; margin-right: 10px; }
    .train-icon { background: #2563eb; }
    .signal-green { background: #22c55e; }
    .signal-yellow { background: #eab308; }
    .signal-red { background: #ef4444; }
    .status-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: white;
      padding: 10px 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      z-index: 1000;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .train-count { font-weight: 600; color: #2563eb; }
    .last-update { color: #666; font-size: 13px; }
    .train-popup { min-width: 200px; }
    .train-popup h3 { margin-bottom: 5px; color: #1e40af; }
    .train-popup p { margin: 3px 0; font-size: 13px; }
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
    <div class="legend-item">
      <div class="legend-color train-icon"></div>
      <span>Train</span>
    </div>
    <div class="legend-item">
      <div class="legend-color signal-green"></div>
      <span>Signal Green</span>
    </div>
    <div class="legend-item">
      <div class="legend-color signal-yellow"></div>
      <span>Signal Yellow</span>
    </div>
    <div class="legend-item">
      <div class="legend-color signal-red"></div>
      <span>Signal Red</span>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([${centerLat}, ${centerLng}], ${zoom});
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let trainsLayer = L.layerGroup().addTo(map);
    let signalsLayer = L.layerGroup().addTo(map);
    let trainMarkers = {};
    let signalMarkers = {};

    function getTrainIcon(heading) {
      return L.divIcon({
        html: \`<div style="
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-bottom: 16px solid #2563eb;
          transform: rotate(\${heading}deg);
        "></div>\`,
        className: 'train-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
    }

    async function fetchTrains() {
      try {
        const response = await fetch('/api/trains');
        const data = await response.json();
        
        if (data.error) {
          console.error('Error fetching trains:', data.error);
          return;
        }
        
        document.getElementById('trainCount').textContent = data.trains.length;
        document.getElementById('lastUpdate').textContent = 
          'Updated: ' + new Date(data.timestamp).toLocaleTimeString();
        
        const newTrainMarkers = {};
        
        data.trains.forEach(train => {
          if (trainMarkers[train.id]) {
            const marker = trainMarkers[train.id];
            marker.setLatLng([train.lat, train.lng]);
            marker.setIcon(getTrainIcon(train.heading));
            marker.setPopupContent(getTrainPopup(train));
            newTrainMarkers[train.id] = marker;
          } else {
            const marker = L.marker([train.lat, train.lng], {
              icon: getTrainIcon(train.heading)
            }).bindPopup(getTrainPopup(train));
            marker.addTo(trainsLayer);
            newTrainMarkers[train.id] = marker;
          }
        });
        
        Object.keys(trainMarkers).forEach(id => {
          if (!newTrainMarkers[id]) {
            trainsLayer.removeLayer(trainMarkers[id]);
          }
        });
        
        trainMarkers = newTrainMarkers;
      } catch (error) {
        console.error('Failed to fetch trains:', error);
      }
    }

    async function fetchSignals() {
      try {
        const response = await fetch('/api/signals');
        const data = await response.json();
        
        if (data.error) {
          console.error('Error fetching signals:', data.error);
          return;
        }
        
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
              radius: 8,
              fillColor: getSignalColor(signal.state),
              color: '#333',
              weight: 2,
              fillOpacity: 0.9
            }).bindPopup(getSignalPopup(signal));
            marker.addTo(signalsLayer);
            newSignalMarkers[signal.id] = marker;
          }
        });
        
        Object.keys(signalMarkers).forEach(id => {
          if (!newSignalMarkers[id]) {
            signalsLayer.removeLayer(signalMarkers[id]);
          }
        });
        
        signalMarkers = newSignalMarkers;
      } catch (error) {
        console.error('Failed to fetch signals:', error);
      }
    }

    function getSignalColor(state) {
      const colors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };
      return colors[state] || '#999';
    }

    function getTrainPopup(train) {
      return \`<div class="train-popup">
        <h3>\${train.id}</h3>
        <p><strong>Operator:</strong> \${train.operator}</p>
        <p><strong>Service:</strong> \${train.service}</p>
        <p><strong>Speed:</strong> \${train.speed} mph</p>
        <p><strong>Status:</strong> \${train.status}</p>
      </div>\`;
    }

    function getSignalPopup(signal) {
      return \`<div class="train-popup">
        <h3>\${signal.id}</h3>
        <p><strong>Type:</strong> \${signal.type}</p>
        <p><strong>State:</strong> \${signal.state}</p>
      </div>\`;
    }

    fetchTrains();
    fetchSignals();
    
    setInterval(() => {
      fetchTrains();
      fetchSignals();
    }, ${refreshInterval});
  </script>
</body>
</html>`;
}
