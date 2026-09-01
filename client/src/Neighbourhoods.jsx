import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
// Namespace import, not a default import - maplibre-gl v5+ dropped its
// default export and ships ESM-only with named exports (Map, Marker,
// NavigationControl, LngLatBounds, ...). `import maplibregl from
// 'maplibre-gl'` worked against the v4-era API this was originally
// written for, but silently imports `undefined` once npm installs a
// current version - confirmed 2026-08-31 by checking
// node_modules/maplibre-gl/package.json (type: module, no `main`,
// exports.import only) and the package's own export list directly.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Neighbourhoods.css';
import { useCity } from './city-context.js';

// Neighbourhoods map screen - added 2026-08-31. A first cut, deliberately
// simple: pins only (no boundary polygons, no landmarks yet - those are
// logged as a fast-follow, see claude/todo.md), map fills the screen, and
// the selected neighbourhood's name/description shows in a fixed sheet at
// the bottom rather than a drag-to-expand one. See the "Neighbourhoods"
// discussion in claude/home-screen-spec.md for the fuller reasoning behind
// why this is a map at all rather than a plain card list.
//
// Base map tiles come from MapTiler's free tier (see client/.env -
// VITE_MAPTILER_KEY) - no card required, 5,000 map sessions/month, shows a
// small MapTiler logo on the free tier. Self-hosting tiles (PMTiles) was
// the discussed alternative if that logo or the usage cap becomes a real
// problem later - not built now, same "ship the simple version first"
// pattern as the rest of this app.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const MAP_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

function Neighbourhoods() {
  const { city } = useCity();
  const [neighbourhoods, setNeighbourhoods] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [mapError, setMapError] = useState(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // neighbourhood id -> { marker, el }

  useEffect(() => {
    if (!city) return;
    setNeighbourhoods(null);
    setSelectedId(null);
    fetch(`${import.meta.env.VITE_API_URL}/api/cities/${city.id}/neighbourhoods`)
      .then((res) => res.json())
      .then((data) => {
        setNeighbourhoods(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((err) => console.error('Failed to fetch neighbourhoods:', err));
  }, [city]);

  // Creates the map once we have both a container to render into and at
  // least one neighbourhood to centre/fit it on. Guarded by mapRef so a
  // second effect run (React StrictMode double-invokes effects in dev)
  // doesn't create a second map instance on top of the first.
  useEffect(() => {
    if (!mapContainerRef.current || !neighbourhoods || neighbourhoods.length === 0) return;
    if (mapRef.current) return;

    if (!MAPTILER_KEY) {
      setMapError(
        'No MapTiler key set - add VITE_MAPTILER_KEY to client/.env (free, no card, see the comment above it) to load the map.'
      );
      return;
    }

    // Captured locally (rather than read via markersRef.current inside the
    // cleanup below) since markersRef.current is a stable Map that's
    // mutated in place, not reassigned - oxlint's exhaustive-deps rule
    // flags any ref access inside a cleanup on principle, so this sidesteps
    // the warning without changing behaviour.
    const markers = markersRef.current;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: [city.longitude, city.latitude],
      zoom: 12,
      // MapLibre adds its own AttributionControl by default, expanded
      // (not the collapsed "i" icon) at this container width - that's the
      // "distracting panel" the user flagged 2026-09-01. Attribution
      // itself can't be removed on MapTiler's free tier (or any self-serve
      // tier - it's a term of the license, not a UI default; see the
      // comment on the control below), but it doesn't need to sit open by
      // default. Disabling the automatic one so a compact version can be
      // added explicitly instead.
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // compact: true collapses this to a small "i" button that only
    // expands to show the required "\u00a9 MapTiler \u00a9 OpenStreetMap
    // contributors" text on tap, instead of sitting open over the map.
    // Styled further in Neighbourhoods.css (.maplibregl-ctrl-attrib) to
    // sit more quietly against this app's UI rather than MapLibre's
    // default look. This does not and can't remove the attribution
    // itself - MapTiler's terms require it stays visible on screen
    // whenever the map is displayed, on every self-serve plan including
    // paid ones; only a separately negotiated enterprise agreement can
    // waive it. See the note under "Neighbourhoods" in
    // claude/home-screen-spec.md for the full reasoning and the
    // self-hosted-PMTiles alternative if this ever needs to go away
    // entirely.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('error', (e) => {
      console.error('MapLibre error:', e?.error ?? e);
      setMapError('Map failed to load - check that VITE_MAPTILER_KEY in client/.env is a valid key.');
    });

    const bounds = new maplibregl.LngLatBounds();
    neighbourhoods.forEach((n) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'neighbourhood-pin';
      el.setAttribute('aria-label', n.name);
      el.addEventListener('click', () => setSelectedId(n.id));

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([n.longitude, n.latitude])
        .addTo(map);

      markers.set(n.id, { marker, el });
      bounds.extend([n.longitude, n.latitude]);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 0 });
    }

    mapRef.current = map;

    return () => {
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
    // Only re-run if the actual neighbourhood set changes identity (new
    // city) - not on every selectedId change, which is handled by the
    // effect below instead so we don't tear down/rebuild the whole map
    // just to change which pin looks active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighbourhoods, city]);

  // Toggles the 'active' class on whichever pin is currently selected,
  // without touching the map/markers themselves.
  useEffect(() => {
    markersRef.current.forEach(({ el }, id) => {
      el.classList.toggle('active', id === selectedId);
    });
  }, [selectedId]);

  const selected = useMemo(
    () => (neighbourhoods ?? []).find((n) => n.id === selectedId) ?? null,
    [neighbourhoods, selectedId]
  );

  return (
    <div className="neighbourhoods-screen">
      <div className="neighbourhoods-header">
        <Link to="/" className="neighbourhoods-back" aria-label="Back to home">
          &larr;
        </Link>
        <h1 className="neighbourhoods-title">Neighbourhoods</h1>
      </div>

      <div className="neighbourhoods-map-wrap">
        <div ref={mapContainerRef} className="neighbourhoods-map" />

        {neighbourhoods === null && (
          <div className="neighbourhoods-status">Loading neighbourhoods&hellip;</div>
        )}
        {neighbourhoods !== null && neighbourhoods.length === 0 && (
          <div className="neighbourhoods-status">No neighbourhoods added for {city?.name} yet.</div>
        )}
        {mapError && <div className="neighbourhoods-status neighbourhoods-status-error">{mapError}</div>}

        {selected && (
          <div className="neighbourhoods-sheet">
            <div className="neighbourhoods-sheet-grabber" />
            <div className="neighbourhoods-sheet-name">{selected.name}</div>
            {selected.description && (
              <div className="neighbourhoods-sheet-description">{selected.description}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Neighbourhoods;
