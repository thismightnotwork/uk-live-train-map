import L from 'leaflet';

export function aspectLabel(aspect) {
  const v = String(aspect || 'unknown').toLowerCase();
  return v === 'red' ? 'Red / danger' : v === 'yellow' ? 'Yellow / caution' : v === 'green' ? 'Green / clear' : 'Aspect unavailable';
}

export function signalIcon(aspect) {
  const v = ['red', 'yellow', 'green'].includes(String(aspect).toLowerCase()) ? String(aspect).toLowerCase() : 'unknown';
  return L.divIcon({
    className: '',
    html: `<div class="signal-marker ${v}"></div>`,
    iconSize: [19, 19],
    iconAnchor: [9, 9],
  });
}
