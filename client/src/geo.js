// Straight-line ("as the crow flies") distance helpers, used for the Eating
// Out distance filter (2026-08-28).
//
// Deliberately NOT a stand-in for real walking distance. Two points close
// in a straight line can require a much longer walk once streets, blocks,
// one-way systems, and geography (rivers, parks) are accounted for - this
// is only accurate enough for a coarse "roughly in the vicinity" cutoff,
// and the UI labels it as straight-line rather than presenting it as
// walking distance. Real walking distance/time (via a routing API such as
// OpenRouteService's Matrix endpoint) is logged as a follow-up in
// claude/todo.md - this module is the cheap, dependency-free groundwork,
// not the final answer.

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

// Distance in km between two lat/long points, via the haversine formula.
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// Short label for a distance-filter chip, e.g. 0.5 -> "500 m", 2 -> "2 km".
export function formatDistanceKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km} km`;
}
