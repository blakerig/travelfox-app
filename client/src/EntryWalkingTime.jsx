import { useEffect, useState } from 'react';
import { useUserLocation } from './useUserLocation.js';
import { haversineDistanceKm } from './geo.js';
import { fetchWalkingDistances, formatWalkingMinutes } from './walkingDistance.js';

// Replaces EntryLocationMap.jsx on the entry-detail screen (2026-09-15) -
// the map was judged to take up too much screen space for what it actually
// told someone ("what street is this on"), so it's been swapped for a
// plain "how long to walk there" line instead. See the commented-out
// EntryLocationMap usage in EntryDetail.jsx for how to bring the map back;
// that component and its CSS are untouched, just unused for now.
//
// Same tap-to-show pattern the map used: `useUserLocation` only ever fires
// the browser's permission prompt from an explicit tap (see that file's
// comment), so this renders a "Show walking time" button rather than the
// prompt firing itself on open. Its own `useUserLocation` instance, same as
// the map had - not threaded down from EntryDetail.jsx.
//
// Passes `autoFetchIfGranted: true` (2026-09-15, added after Blake found
// re-tapping "Show walking time" on every single entry annoying) so a tap
// is only ever needed once per device, not once per entry - each entry-
// detail screen is its own component instance (unlike CategoryScreen, which
// stays mounted across a category switch and so keeps a granted location
// for the rest of that visit for free), so without this, permission already
// being granted from a previous entry (or from the Eating Out distance
// filter) didn't save the next entry from needing its own tap. See the
// autoFetchIfGranted doc comment in useUserLocation.js for why this is safe
// (never triggers the browser's own permission dialog, only skips the wait
// once it's already been granted) and why it's opt-in there rather than the
// hook's default.
//
// Prefers real walking duration from the same OpenRouteService Matrix
// endpoint the Eating Out distance filter uses (`POST /api/walking-
// distances`, see walkingDistance.js/CategoryScreen.jsx) - this was
// already logged in claude/todo.md as the natural "duration for free"
// follow-up once that endpoint existed. Falls back to a straight-line
// estimate (haversine distance / an assumed walking speed) whenever ORS
// isn't configured, errors, or can't route there on foot at all - same
// "never silently show a straight-line number under a real-distance label"
// principle as the filter, so the fallback is always visibly labeled
// "(straight-line estimate)" rather than presented as equally precise.

// ~5 km/h - a commonly used average adult walking pace (the same rough
// figure most map apps assume), not measured against this app's own users.
// Only used for the straight-line fallback; the real ORS duration above
// doesn't depend on this at all.
const FALLBACK_WALKING_SPEED_KMH = 5;

function estimateMinutes(km) {
  return Math.round((km / FALLBACK_WALKING_SPEED_KMH) * 60);
}

// formatWalkingMinutes lives in walkingDistance.js (2026-09-15) - shared
// with EntryCard.jsx's card-level walking time, see CategoryScreen.jsx.

function EntryWalkingTime({ latitude, longitude }) {
  const { status: locationStatus, coords: userCoords, requestLocation } = useUserLocation({
    autoFetchIfGranted: true,
  });
  // 'idle' | 'loading' | 'real' | 'estimate' - 'idle' until userCoords
  // arrives, then either resolves to a real ORS duration or falls back to
  // the straight-line estimate (never errors outward - a failure just
  // means "estimate").
  const [walkingStatus, setWalkingStatus] = useState('idle');
  const [minutes, setMinutes] = useState(null);

  useEffect(() => {
    if (!userCoords) return;
    let cancelled = false;
    setWalkingStatus('loading');

    const useFallback = () => {
      if (cancelled) return;
      const km = haversineDistanceKm(userCoords.latitude, userCoords.longitude, latitude, longitude);
      setMinutes(estimateMinutes(km));
      setWalkingStatus('estimate');
    };

    fetchWalkingDistances(import.meta.env.VITE_API_URL, userCoords, [
      { id: 'entry', latitude, longitude },
    ])
      .then((results) => {
        if (cancelled) return;
        const result = results.get('entry');
        // durationSeconds is null when ORS genuinely can't route there on
        // foot (see walkingDistance.js) - same fallback as any other
        // failure, not a special "unreachable" message, since a straight-
        // line estimate is still more useful than nothing here.
        if (result?.durationSeconds != null) {
          setMinutes(Math.round(result.durationSeconds / 60));
          setWalkingStatus('real');
        } else {
          useFallback();
        }
      })
      .catch(() => useFallback());

    return () => {
      cancelled = true;
    };
  }, [userCoords?.latitude, userCoords?.longitude, latitude, longitude]);

  const isBusy = locationStatus === 'loading' || walkingStatus === 'loading';

  return (
    <div className="entry-detail-contact-row entry-detail-walking-row">
      <span className="entry-detail-contact-label">Walking</span>
      <span className="entry-detail-contact-value">
        {isBusy ? (
          'Calculating…'
        ) : minutes != null ? (
          <>
            ~{formatWalkingMinutes(minutes)} walk
            {walkingStatus === 'estimate' && (
              <span className="entry-detail-walking-approx"> (straight-line estimate)</span>
            )}
          </>
        ) : locationStatus === 'denied' || locationStatus === 'unavailable' ? (
          'Location unavailable'
        ) : (
          <button type="button" className="entry-detail-walking-btn" onClick={requestLocation}>
            Show walking time
          </button>
        )}
      </span>
    </div>
  );
}

export default EntryWalkingTime;
