import demoRoutes from '../data/demo-routes.json';

const API_URL = 'https://live-trains.lucafinnisbernard.co.uk/trains?crs=SWK';

function point(value) {
  if (!value) return null;
  const lat = Number(value.lat ?? value.latitude);
  const lng = Number(value.lng ?? value.lon ?? value.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function normalise(train) {
  const position = point(train);
  if (!position) return null;

  const route = Array.isArray(train.route) ? train.route.map(point).filter(Boolean) : [];
  const signals = Array.isArray(train.signals)
    ? train.signals.map((signal) => {
        const signalPoint = point(signal);
        return signalPoint
          ? { ...signalPoint, id: signal.id ?? signal.name ?? 'Signal', name: signal.name ?? signal.id ?? 'Signal', aspect: signal.aspect ?? null }
          : null;
      }).filter(Boolean)
    : [];

  return {
    ...train,
    id: String(train.id ?? train.serviceId ?? train.uid ?? `${train.headcode ?? 'train'}-${position.lat}-${position.lng}`),
    headcode: train.headcode ?? train.headCode ?? train.trainNumber ?? 'Unknown',
    latitude: position.lat,
    longitude: position.lng,
    route,
    signals,
  };
}

export async function getLiveTrains() {
  try {
    const response = await fetch(API_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Worker returned HTTP ${response.status}`);
    const payload = await response.json();
    const rawTrains = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.trains)
        ? payload.trains
        : Array.isArray(payload.data)
          ? payload.data
          : [];
    const trains = rawTrains.map(normalise).filter(Boolean);
    if (!trains.length) throw new Error('Worker returned no mappable train positions');
    return { trains, usingDemo: false };
  } catch (error) {
    console.warn('Live train feed unavailable; using demo data.', error);
    return {
      trains: demoRoutes.map(normalise).filter(Boolean),
      usingDemo: true,
    };
  }
}
