export function normaliseRoute(route, train) {
  const points = (Array.isArray(route) ? route : []).map((p) => {
    const lat = Number(p.lat ?? p.latitude ?? p[0]);
    const lng = Number(p.lng ?? p.longitude ?? p.lon ?? p[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }).filter(Boolean);
  return points.length ? points : [[train.latitude, train.longitude]];
}
