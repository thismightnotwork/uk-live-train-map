import demoRoutes from '../data/demo-routes.json';

const API_URL = 'https://live-trains.lucafinnisbernard.co.uk/trains/?crs=SWK';

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const source = value.position && typeof value.position === 'object' ? { ...value, ...value.position } : value;
  const lat = Number(source.lat ?? source.latitude ?? source.location?.lat ?? source.location?.latitude);
  const lng = Number(source.lng ?? source.lon ?? source.longitude ?? source.location?.lng ?? source.location?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function normaliseRoute(route) { return Array.isArray(route) ? route.map(point).filter(Boolean) : []; }
function normaliseSignals(signals) {
  if (!Array.isArray(signals)) return [];
  return signals.map((signal) => { const position = point(signal); return position ? { ...position, id: signal.id ?? signal.name ?? 'Signal', name: signal.name ?? signal.id ?? 'Signal', aspect: signal.aspect ?? null } : null; }).filter(Boolean);
}
export function normalise(train) {
  const position = point(train);
  if (!position) return null;
  return { ...train, id: String(train.id ?? train.serviceId ?? train.uid ?? `${train.headcode ?? 'train'}-${position.lat}-${position.lng}`), headcode: train.headcode ?? train.headCode ?? train.trainNumber ?? train.service?.headcode ?? 'Unknown', latitude: position.lat, longitude: position.lng, updatedAt: train.updatedAt ?? train.timestamp ?? train.lastUpdated, operator: train.operator ?? train.toc ?? train.service?.operator ?? '', origin: train.origin ?? train.from ?? train.service?.origin ?? '', destination: train.destination ?? train.to ?? train.service?.destination ?? '', route: normaliseRoute(train.route ?? train.path ?? train.service?.route), signals: normaliseSignals(train.signals ?? train.signalMarkers ?? train.service?.signals) };
}
function rawArray(payload) { if (Array.isArray(payload)) return payload; for (const key of ['trains', 'data', 'services', 'results', 'items']) if (Array.isArray(payload?.[key])) return payload[key]; return []; }
export async function getLiveTrains() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(API_URL, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Worker returned HTTP ${response.status}`);
    const trains = rawArray(await response.json()).map(normalise).filter(Boolean);
    if (!trains.length) throw new Error('Worker returned no mappable train positions');
    return { trains, usingDemo: false, error: null };
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Worker request timed out' : error.message;
    console.warn('Live train feed unavailable; using demo data.', error);
    return { trains: demoRoutes.map(normalise).filter(Boolean), usingDemo: true, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
