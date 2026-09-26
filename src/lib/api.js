import demoRoutes from '../data/demo-routes.json';

// Replace this with your deployed worker URL.
// Example: https://your-worker.<your-subdomain>.workers.dev/trains?crs=SWK
const LIVE_POSITIONS_URL = 'live-trains.lucafinnisbernard.co.uk';

function normalise(item, index) {
  const latitude = Number(item.latitude ?? item.lat);
  const longitude = Number(item.longitude ?? item.lng ?? item.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id: String(item.id ?? item.trainId ?? item.headcode ?? `train-${index}`),
    headcode: item.headcode ?? item.train_id ?? item.id ?? 'Train',
    latitude,
    longitude,
    updatedAt: item.updatedAt ?? item.updated_at ?? new Date().toISOString(),
    operator: item.operator ?? item.toc_name ?? '',
    origin: item.origin ?? '',
    destination: item.destination ?? '',
    route: item.route ?? [],
    signals: item.signals ?? [],
  };
}

export async function getLiveTrains() {
  // If no URL is configured, use demo data so the map still works.
  if (!LIVE_POSITIONS_URL) {
    return demoRoutes.map(normalise).filter(Boolean);
  }

  const response = await fetch(LIVE_POSITIONS_URL, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Source returned ${response.status}`);
  }

  const payload = await response.json();
  const input = Array.isArray(payload) ? payload : (payload.trains ?? payload.data ?? []);

  if (!Array.isArray(input)) {
    throw new Error('Source did not return a train array');
  }

  return input.map(normalise).filter(Boolean);
}
