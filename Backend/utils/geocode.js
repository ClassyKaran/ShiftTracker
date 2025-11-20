import GeoCache from '../models/GeoCache.js';

const DEFAULT_PROVIDER = process.env.GEOCODE_PROVIDER_URL || 'https://nominatim.openstreetmap.org/reverse';

export async function reverseGeocode(lat, lng) {
  try {
    if (lat == null || lng == null) return null;
    const key = `${lat},${lng}`;
    const cached = await GeoCache.findOne({ key });
    if (cached) return { name: cached.name, raw: cached.raw };

    const url = `${DEFAULT_PROVIDER}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'ShiftTracker/1.0 (+https://example.com)' } });
    if (!resp.ok) return null;
    const json = await resp.json();
    const name = json.display_name || (json.address ? Object.values(json.address).join(', ') : '');
    const g = await GeoCache.create({ key, name, provider: DEFAULT_PROVIDER, raw: json });
    return { name, raw: json };
  } catch (e) {
    console.error('reverseGeocode error', e);
    return null;
  }
}
