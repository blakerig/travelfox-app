// Client-side helper for the entry-editor address-to-coordinates lookup
// (2026-09-05) - see "Automate lat/long lookup" in claude/todo.md and the
// server's GET /api/geocode, which proxies this to OpenStreetMap's
// Nominatim search so the required identifying User-Agent header (browsers
// block JS from setting this) can actually be sent.
//
// Returns { latitude, longitude, displayName } on a match, or null when
// Nominatim has no result for the query - a real "nothing found" answer,
// not a failure (see EntryEditor.jsx, which shows these two cases
// differently). Throws on an actual failure (network error, non-2xx
// response) - the caller is responsible for catching that and showing it
// as a lookup error, not a "nothing found" result.
export async function geocodeAddress(apiUrl, query) {
  const res = await fetch(`${apiUrl}/api/geocode?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error(`Geocoding lookup failed (${res.status})`);
  }
  const data = await res.json();
  if (!data.found) return null;
  return { latitude: data.latitude, longitude: data.longitude, displayName: data.displayName };
}
