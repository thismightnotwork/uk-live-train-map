import demoRoutes from '../data/demo-routes.json';

// Replace with a CORS-enabled endpoint you control. Keep provider credentials server-side.
const LIVE_POSITIONS_URL = '';

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
  if (!LIVE_POSITIONS_URL) return demoRoutes.map(normalise).filter(Boolean);
  const response = await fetch(LIVE_POSITIONS_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  const payload = await response.json();
  const input = Array.isArray(payload) ? payload : (payload.trains ?? payload.data ?? []);
  if (!Array.isArray(input)) throw new Error('Source did not return a train array');
  return input.map(normalise).filter(Boolean);
}
