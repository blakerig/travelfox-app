import { useEffect, useRef, useState } from 'react';
// Namespace import, not default - see the same comment in
// Neighbourhoods.jsx: maplibre-gl v5+ dropped its default export and
// ships ESM-only with named exports (Map, Marker, AttributionControl,
// ...). A default import silently resolves to undefined against the
// version this app has installed.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './EntryLocationMap.css';

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
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const MAP_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

function EntryLocationMap({ latitude, longitude, label }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    // Guards against React StrictMode's double-invoked effects in dev
    // creating a second map instance on top of the first - same pattern
    // as Neighbourhoods.jsx.
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

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: [longitude, latitude],
      zoom: 15,
      // No mouse/touch/keyboard handlers attached at all - see the file
      // comment above for why this map is deliberately static rather than
      // pannable/zoomable like the Neighbourhoods one.
      interactive: false,
      attributionControl: false,
    });
    // Attribution can't be removed - MapTiler's terms require it on every
    // self-serve plan, free or paid, same as Neighbourhoods.jsx - but it
    // can stay compact/collapsed rather than an open panel. See the fuller
    // reasoning under "Neighbourhoods" in claude/home-screen-spec.md.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('error', (e) => {
      console.error('MapLibre error:', e?.error ?? e);
      setMapError('load-error');
    });

    const el = document.createElement('div');
    el.className = 'entry-location-pin';
    new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([longitude, latitude])
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  if (mapError) return null;

  return (
    <div
      ref={mapContainerRef}
      className="entry-location-map"
      role="img"
      aria-label={label ? `Map showing the location of ${label}` : 'Map showing the location'}
    />
  );
}

export default EntryLocationMap;
