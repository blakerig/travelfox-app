import { useMemo } from 'react';
import { useCity } from './city-context.js';
import { useUserLocation } from './useUserLocation.js';
import { haversineDistanceKm } from './geo.js';
import './CityPicker.css';

// Beyond this radius we stop trusting "nearest covered city" as a match -
// confidently returning the nearest city when someone is actually
// somewhere the app doesn't cover would be actively misleading, not just
// imprecise (same reasoning as the Eating Out distance filter being a
// filter, never a "Nearest" sort - see geo.js).
const MAX_MATCH_DISTANCE_KM = 50;

// City switcher (2026-08-30), opened from the tappable city name on
// Home.jsx. Two ways to pick a city:
//   - the plain list below, for a manual/planning-ahead pick (e.g. someone
//     in Barcelona browsing Madrid ahead of a trip) - this is the pick
//     that persists across reloads, see CityProvider.jsx.
//   - "Use my current location" above the list, an explicit, on-demand
//     shortcut back to wherever the user actually is right now, so a
//     manual pick never has to be "undone" by re-finding the same city in
//     the list. Reuses the same request-on-demand geolocation hook and
//     haversine helper built for the Eating Out distance filter.
function CityPicker({ onClose }) {
  const { city, cities, selectCity } = useCity();
  const { status: locationStatus, coords, requestLocation } = useUserLocation();

  const nearestMatch = useMemo(() => {
    if (locationStatus !== 'granted' || !coords) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of cities) {
      if (candidate.latitude == null || candidate.longitude == null) continue;
      const distance = haversineDistanceKm(
        coords.latitude,
        coords.longitude,
        candidate.latitude,
        candidate.longitude
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best && bestDistance <= MAX_MATCH_DISTANCE_KM ? best : null;
  }, [locationStatus, coords, cities]);

  function handleSelect(picked) {
    selectCity(picked);
    onClose();
  }

  return (
    <div className="city-picker-backdrop" onClick={onClose}>
      <div
        className="city-picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a city"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="city-picker-header">
          <div className="city-picker-title">Choose a city</div>
          <button type="button" className="city-picker-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="city-picker-current-location">
          {locationStatus === 'idle' && (
            <button type="button" className="city-picker-location-button" onClick={requestLocation}>
              <span className="city-picker-pin">📍</span> Use my current location
            </button>
          )}

          {locationStatus === 'loading' && (
            <div className="city-picker-location-status">Finding your location…</div>
          )}

          {(locationStatus === 'denied' || locationStatus === 'unavailable') && (
            <div className="city-picker-location-status">
              Couldn&apos;t access your location.{' '}
              <button type="button" className="city-picker-location-retry" onClick={requestLocation}>
                Try again
              </button>
            </div>
          )}

          {locationStatus === 'granted' && nearestMatch && (
            <button
              type="button"
              className="city-picker-location-button"
              onClick={() => handleSelect(nearestMatch)}
            >
              <span className="city-picker-pin">📍</span> Return to {nearestMatch.name}
            </button>
          )}

          {locationStatus === 'granted' && !nearestMatch && (
            <div className="city-picker-location-status">
              No covered city found near you.{' '}
              <button type="button" className="city-picker-location-retry" onClick={requestLocation}>
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="city-picker-divider" />

        <ul className="city-picker-list">
          {cities.map((c) => (
            <li key={c.id}>
              <button type="button" className="city-picker-item" onClick={() => handleSelect(c)}>
                <span className="city-picker-item-name">{c.name}</span>
                {c.country?.name && <span className="city-picker-item-country">{c.country.name}</span>}
                {city?.id === c.id && (
                  <span className="city-picker-item-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default CityPicker;
