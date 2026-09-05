// Client-side helper for the real walking-distance filter (2026-09-04) -
// see "Real walking distance/time" in claude/todo.md and the server's
// POST /api/walking-distances, which proxies this to OpenRouteService's
// Matrix API so the ORS API key never reaches the browser.
//
// Returns a Map of entry id -> { distanceMeters, durationSeconds } for
// every destination passed in. Throws on any failure (network error,
// non-2xx response, ORS_API_KEY not configured server-side) - the caller
// (CategoryScreen.jsx) is responsible for catching that and falling back
// to the honest straight-line filter, never silently showing straight-line
// numbers under a "walking distance" label (see the "Suggested approach"
// note in claude/todo.md - this is the exact failure mode that note warns
// against). A destination ORS couldn't route to on foot at all
// (unreachable, or outside its search radius) comes back with both fields
// null rather than omitted, so the caller can tell "no data" apart from
// "genuinely unreachable" and treat both the same way (excluded from a
// radius filter) without a third case to handle.
export async function fetchWalkingDistances(apiUrl, origin, destinations) {
  const res = await fetch(`${apiUrl}/api/walking-distances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      destinations: destinations.map((d) => ({
        id: d.id,
        latitude: d.latitude,
        longitude: d.longitude,
      })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Walking-distance lookup failed (${res.status})`);
  }
  const { results } = await res.json();
  const map = new Map();
  for (const r of results) {
    map.set(r.id, { distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds });
  }
  return map;
}
