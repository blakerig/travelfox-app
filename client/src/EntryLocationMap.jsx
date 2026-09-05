import { useEffect, useRef, useState } from 'react';
// Namespace import, not default - see the same comment in
// Neighbourhoods.jsx: maplibre-gl v5+ dropped its default export and
// ships ESM-only with named exports (Map, Marker, AttributionControl,
// ...). A default import silently resolves to undefined against the
// version this app has installed.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './EntryLocationMap.css';
import { useUserLocation } from './useUserLocation.js';
import { haversineDistanceKm } from './geo.js';

// Small "here's where it is" pin map for the entry-detail screen - added
// 2026-09-04, tier two of the "Directions to an Entry" work logged in
// claude/todo.md (tier one, the "Get directions" link-out row right above
// this in EntryDetail.jsx, shipped first). This is deliberately NOT
// turn-by-turn or even pannable - just a static, at-a-glance pin showing
// where the entry actually is, the way Yelp/TripAdvisor show a small map
// thumbnail on a listing page. Actual navigation stays the Directions
// link's job, which hands off to the device's own maps app - no reason to
// rebuild live traffic/transit/turn-by-turn here.
//
// Reuses the same MapLibre GL JS + MapTiler setup Neighbourhoods.jsx
// already has working end-to-end (see "Neighbourhoods" in
// claude/home-screen-spec.md) rather than a second mapping integration -
// same tile source/key, same attribution requirement/styling approach,
// same "namespace import" gotcha already solved there. What's different
// here: one fixed pin (no click handler, no selection state), and the map
// itself is non-interactive (see `interactive: false` below) so a swipe
// over it scrolls the entry-detail page instead of panning the map - a
// small embedded glance-map trapping page scroll is a common mobile-web
// annoyance this avoids by simply not being draggable/zoomable. Tapping
// the map does nothing beyond that; the Directions row above it is the
// actual call to action.
//
// "You are here" pin - added 2026-09-05, following a direct question from
// the user about what this map was actually for without a reference point.
// The map without the user's own position only ever answered "what street/
// area is this on," useful mainly to someone who already has some mental
// picture of the city - it never answered the more useful "is this near
// me," which was otherwise only available as text (the Directions link,
// and eventually a walking-duration figure once the Matrix work in
// claude/todo.md lands). Deliberately tap-to-show rather than requesting
// location the moment this screen opens: `useUserLocation` was built
// request-on-demand specifically so a location prompt only ever appears
// after an explicit action (see that file's comment) - opening an
// entry-detail screen to read about a restaurant isn't that action, so a
// small "Show my location" control was added instead of firing the browser
// permission dialog unprompted. Kept entirely local to this component
// (its own `useUserLocation` call) rather than threading location down
// from `EntryDetail.jsx` - a granted location here does not persist to
// other entries or back to a category list's distance filter, since there
// is no shared location context yet (see MAX_USER_LOCATION_DISTANCE_KM
// note below and the file comment in useUserLocation.js for the
// per-component-instance caveat) - worth revisiting only if re-prompting
// across screens in the same visit turns out to actually bother people.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const MAP_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

// Beyond this, "you are here" stops being a useful annotation on a
// deliberately street-level (zoom 15-ish) glance map - framing both points
// would zoom out so far the map loses the exact context (which street,
// which plaza) it exists to show, and "you're 400km away" isn't the kind
// of "near me" answer this control is for anyway. Chosen as a loose
// "same metro area, plausibly walkable-to-a-transit-stop" cutoff, not a
// precisely researched number - same spirit as the other coarse distance
// cutoffs already in this app (WALKING_DISTANCE_PREFILTER_KM in
// CategoryScreen.jsx, the 3km first-pass note in claude/todo.md).
const MAX_USER_LOCATION_DISTANCE_KM = 50;

function EntryLocationMap({ latitude, longitude, label }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState(null);
  const { status: locationStatus, coords: userCoords, requestLocation } = useUserLocation();

  const userDistanceKm =
    userCoords != null
      ? haversineDistanceKm(userCoords.latitude, userCoords.longitude, latitude, longitude)
      : null;
  const showUserPin = userDistanceKm != null && userDistanceKm <= MAX_USER_LOCATION_DISTANCE_KM;
  const userTooFar = userDistanceKm != null && !showUserPin;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    // Guards against React StrictMode's double-invoked effects in dev
    // creating a second map instance on top of the first - same pattern
    // as Neighbourhoods.jsx. The cleanup below (which nulls this out)
    // still runs on every real dependency change first, so this doesn't
    // block the map from rebuilding when the user's location arrives.
    if (mapRef.current) return;

    if (!MAPTILER_KEY) {
      // Fails quiet rather than showing an error box here - this is a
      // small supplementary widget, not the primary way to get directions
      // (see the Directions link/getDirectionsUrl in EntryDetail.jsx,
      // which doesn't depend on MapTiler at all), so a missing/misconfigured
      // key just means this component renders nothing instead of an
      // alarming error message on every entry-detail screen.
      setMapError('missing-key');
      return;
    }

    const mapOptions = {
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      // No mouse/touch/keyboard handlers attached at all - see the file
      // comment above for why this map is deliberately static rather than
      // pannable/zoomable like the Neighbourhoods one. Framing two points
      // via `bounds` below is just an initial camera calculation, not an
      // interaction, so it's unaffected by this.
      interactive: false,
      attributionControl: false,
    };

    if (showUserPin) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([longitude, latitude]);
      bounds.extend([userCoords.longitude, userCoords.latitude]);
      mapOptions.bounds = bounds;
      // maxZoom stops two very close points (a few doors down) from
      // zooming in absurdly tight - 16 keeps at least a little street
      // context either way, same reasoning as the fixed zoom: 15 used
      // below for the single-pin case.
      mapOptions.fitBoundsOptions = { padding: 32, maxZoom: 16 };
    } else {
      mapOptions.center = [longitude, latitude];
      mapOptions.zoom = 15;
    }

    const map = new maplibregl.Map(mapOptions);
    // Attribution can't be removed - MapTiler's terms require it on every
    // self-serve plan, free or paid, same as Neighbourhoods.jsx - but it
    // can stay compact/collapsed rather than an open panel. See the fuller
    // reasoning under "Neighbourhoods" in claude/home-screen-spec.md.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('error', (e) => {
      console.error('MapLibre error:', e?.error ?? e);
      setMapError('load-error');
    });

    const entryPinEl = document.createElement('div');
    entryPinEl.className = 'entry-location-pin';
    new maplibregl.Marker({ element: entryPinEl, anchor: 'bottom' })
      .setLngLat([longitude, latitude])
      .addTo(map);

    if (showUserPin) {
      const userPinEl = document.createElement('div');
      userPinEl.className = 'entry-location-user-pin';
      new maplibregl.Marker({ element: userPinEl, anchor: 'center' })
        .setLngLat([userCoords.longitude, userCoords.latitude])
        .addTo(map);
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, showUserPin, userCoords?.latitude, userCoords?.longitude]);

  if (mapError) return null;

  return (
    <div className="entry-location-map-frame">
      <div
        ref={mapContainerRef}
        className="entry-location-map"
        role="img"
        aria-label={label ? `Map showing the location of ${label}` : 'Map showing the location'}
      />
      {/* Never shown once a usable "you are here" pin is already on the
          map - only covers the states before/instead of that: not asked
          yet, in flight, declined/unsupported, or granted but too far to
          plot usefully (see MAX_USER_LOCATION_DISTANCE_KM above). */}
      {!showUserPin && (
        <div className="entry-location-locate">
          {locationStatus === 'loading' ? (
            <span className="entry-location-locate-status">Locating…</span>
          ) : userTooFar ? (
            <span className="entry-location-locate-status">You're too far away to show here</span>
          ) : locationStatus === 'denied' || locationStatus === 'unavailable' ? (
            <span className="entry-location-locate-status">Location unavailable</span>
          ) : (
            <button type="button" className="entry-location-locate-btn" onClick={requestLocation}>
              Show my location
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default EntryLocationMap;
