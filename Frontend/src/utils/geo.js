export async function reverseGeocodeIfCoords(loc) {
  if (!loc || typeof loc !== 'string') return loc;
  const coordsMatch = loc.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!coordsMatch) return loc; // not coords, assume already a name
  const lat = coordsMatch[1];
  const lon = coordsMatch[2];
  const key = `rev:${lat},${lon}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached;
    // Use Nominatim reverse geocode (OpenStreetMap). Keep calls light.
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!resp.ok) return `${lat},${lon}`;
    const data = await resp.json();
    const name = data.display_name || `${lat},${lon}`;
    try { sessionStorage.setItem(key, name); } catch(e){}
    return name;
  } catch (e) {
    return loc;
  }
}
