import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './CategoryScreen.css';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import { getCategoryConfig } from './categoryConfig.js';
import EntryCard from './EntryCard.jsx';
import { haversineDistanceKm, formatDistanceKm } from './geo.js';
import { fetchWalkingDistances } from './walkingDistance.js';
import { useUserLocation } from './useUserLocation.js';
import { activityTypeHref } from './activityTypeHref.js';
import { isOpenNow } from './openingHours.js';

// Radius choices for the Eating Out distance filter (2026-08-28) - single
// select (tapping the active one again clears it), not the OR-multi-select
// pattern cuisine/price chips use, since a radius is a cumulative cutoff
// ("within 2km") rather than a set of independent options.
const RADIUS_OPTIONS_KM = [0.5, 1, 2, 5];

// Generous straight-line pre-filter cap before ever calling the real
// walking-distance API - a first, cheap, dependency-free narrowing pass
// (see the "Suggested approach" note in claude/todo.md), not the final
// filter. Deliberately well above the largest radius chip (5km) rather
// than matching it: real walking distance can be meaningfully longer than
// straight-line (a river, a one-way system - the exact problem this
// feature exists to fix), so something just past 5km in a straight line
// could still turn out to be within 5km on foot in an unusual street
// layout, and this cap should not be the thing that silently excludes it
// before the real API even gets a chance to answer. Also caps request
// size regardless of city size, independent of MAX_MATRIX_DESTINATIONS on
// the server.
const WALKING_DISTANCE_PREFILTER_KM = 8;

// Sorting is done client-side for now - lists are small in v1 and this
// avoids adding server-side sort-param parsing before it's actually needed.
// Revisit (move to the API, via ?sort=) if item counts grow enough to matter.
//
// sortBy === 'curated' (Eating Out's default, see categoryConfig.js) is
// deliberately not handled here - falling through both branches leaves
// `items` in the order the server returned them, i.e. Entry.sortOrder
// (see GET /api/cities/:cityId/entries), so "Recommended" just means
// "however it was hand-ordered in Prisma Studio."
//
// For a grouped category (Activities, see groupedByType in
// categoryConfig.js) sortBy is always null - ActivityType objects don't
// have `rating`, so this just falls through the `!sortBy` guard below and
// leaves the server's ActivityType.sortOrder order untouched, same
// mechanism one level up.
function sortItems(items, sortBy) {
  if (!sortBy) return items;
  const sorted = items.slice();
  if (sortBy === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'rating') {
    sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }
  return sorted;
}

// Filtering is also client-side, same rationale as sortItems - added
// 2026-08-28 for Eating Out (cuisine/priceLevel via the generic Entry.type
// field, then distance same day - see categoryConfig.js's filterOptions).
// Empty selection sets (and a null radiusKm) mean "no filter applied" for
// that dimension, not "match nothing" - multiple selections within one
// dimension are OR'd together (any selected type matches), all active
// dimensions are AND'd together (an entry must satisfy every active
// filter). An entry with no types/a blank priceLevel, or missing
// coordinates when a radius is active, never matches an active filter on
// that dimension - same as any other faceted filter UI.
//
// `entry.type` became `entry.types` (2026-08-30, an array - see
// schema.prisma) so one entry can carry more than one cuisine/place type.
// The `types` filter dimension now matches if *any* of an entry's values is
// in the selected set - i.e. OR both within the selection (pick "Tapas" or
// "Catalan", either matches) and within the entry (an entry tagged both
// only needs one to be selected).
//
// Distance prefers real walking distance (`walkingDistances`, a Map of
// entry id -> { distanceMeters, durationSeconds } from the ORS Matrix API
// via walkingDistance.js/POST /api/walking-distances - see "Real walking
// distance/time" in claude/todo.md) when it's available, falling back to
// straight-line (haversine) distance from `origin` (the user's geolocated
// position, see useUserLocation.js) when it isn't - still loading, the API
// call failed, or an entry simply wasn't in the pre-filtered candidate set
// sent to it (see WALKING_DISTANCE_PREFILTER_KM above). Passing
// `walkingDistances` as null (rather than omitting it) is how the caller
// says "not ready, use straight-line" - see CategoryScreen's
// filteredItems useMemo, which only passes the real Map once its fetch has
// actually succeeded. An entry missing from the Map, or with a null
// distanceMeters (ORS couldn't route to it on foot), never matches an
// active radius filter - same as any other faceted filter excluding data
// it doesn't have, not a guess. See geo.js and the 'distance' note in
// categoryConfig.js for why straight-line is a filter only in the first
// place, never a sort - that reasoning still applies to real distance too,
// not because real distance is imprecise, but because a "Nearest" sort is
// a separate, deliberately-not-built-yet UI decision (see claude/todo.md).
//
// 'openNow' (2026-09-02, Eating Out only) works the same way as the other
// dimensions - an independent AND'd-in condition - but unlike
// types/priceLevel/distance it isn't derived from `items` at all; it calls
// isOpenNow() (openingHours.js) per-entry using the *current* moment in
// `timezone` (the active city's, passed down from CategoryScreen's render
// - see city.timezone in schema.prisma). See categoryConfig.js's
// cardShowOpenStatus/'openNow' doc comments for why this filter is only
// offered when the city has a timezone set at all.
//
// A grouped category (Activities) never has any dimension active - no UI
// drives filterOptions there (see categoryConfig.js) - so this returns
// early before touching any ActivityType-shaped item.
function filterItems(items, { types, priceLevels, radiusKm, origin, openNowOnly, timezone, walkingDistances }) {
  if (types.size === 0 && priceLevels.size === 0 && radiusKm == null && !openNowOnly) return items;
  return items.filter((entry) => {
    const typeOk = types.size === 0 || (entry.types ?? []).some((t) => types.has(t));
    const priceOk =
      priceLevels.size === 0 || (entry.priceLevel != null && priceLevels.has(entry.priceLevel));
    let distanceOk;
    if (radiusKm == null) {
      distanceOk = true;
    } else if (walkingDistances) {
      // Real walking distance is ready - an entry not in the Map (outside
      // the pre-filtered candidate set) or with a null distanceMeters (ORS
      // couldn't route to it on foot) simply doesn't match, same as any
      // other filter excluding data it doesn't have.
      const wd = walkingDistances.get(entry.id);
      distanceOk = wd != null && wd.distanceMeters != null && wd.distanceMeters <= radiusKm * 1000;
    } else {
      distanceOk = Boolean(
        origin &&
          entry.latitude != null &&
          entry.longitude != null &&
          haversineDistanceKm(origin.latitude, origin.longitude, entry.latitude, entry.longitude) <=
            radiusKm
      );
    }
    // An entry with no parseable opening-hours text, or whose city has no
    // timezone set, gets isOpenNow === null - treated as "doesn't match"
    // while the filter is active, same as priceOk/distanceOk excluding an
    // entry missing that data rather than guessing.
    const openNowOk = !openNowOnly || isOpenNow(entry.openingTimes, timezone) === true;
    return typeOk && priceOk && distanceOk && openNowOk;
  });
}

function toggleSetValue(set, value) {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

// sessionStorage can throw (private browsing, storage disabled) - these
// swallow that and just behave as if nothing was saved, same as a first
// visit.
function loadSavedPrefs(key) {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(`categoryPrefs:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveScrollY(key, y) {
  try {
    sessionStorage.setItem(`categoryScroll:${key}`, String(y));
  } catch {
    // ignore
  }
}

function loadScrollY(key) {
  try {
    const raw = sessionStorage.getItem(`categoryScroll:${key}`);
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

// Generic category detail screen - one component for all five categories.
// Per-category differences (title, card layout, whether sorting/filtering
// is offered) come from categoryConfig.js rather than from separate screen
// components.
//
// Activities is a partial exception (2026-08-28, see groupedByType in
// categoryConfig.js and ActivityType in schema.prisma): `items` holds
// ActivityType rows instead of Entry rows, each rendered with EntryCard's
// 'group' variant and linking to either ActivityTypeDetail or, for a
// single-provider type with no description, straight to that provider's
// EntryDetail (see activityTypeHref above). Everything else on this screen
// - header, count line, loading/empty states - is unchanged, and the
// sort/filter machinery below safely no-ops for this case rather than
// needing its own branch, since Activities sets sortOptions/filterOptions
// to null.
function CategoryScreen() {
  const { slug } = useParams();
  const { city, loading: cityLoading } = useCity();
  const { cityData } = useCityData();
  const config = getCategoryConfig(slug);
  const key = city ? `${city.id}:${slug}` : null;
  const currencySymbol = city?.country?.currencySymbol || '$';
  // Read once, on this component instance's first render only (the
  // useState calls below only ever use their initial argument on that
  // same first render) - captures whatever sort/filter selection was
  // saved the last time this exact city+category was visited, e.g. right
  // before navigating into EntryDetail.jsx. See the loadedKey block below
  // for why this doesn't get clobbered by the very next render.
  const [initialPrefs] = useState(() => loadSavedPrefs(key));
  const [sortBy, setSortBy] = useState(
    initialPrefs?.sortBy ?? config.sortOptions?.[0]?.value ?? null
  );
  const [selectedTypes, setSelectedTypes] = useState(() => new Set(initialPrefs?.types ?? []));
  const [selectedPriceLevels, setSelectedPriceLevels] = useState(
    () => new Set(initialPrefs?.priceLevels ?? [])
  );
  const [selectedRadiusKm, setSelectedRadiusKm] = useState(initialPrefs?.radiusKm ?? null);
  const [selectedOpenNowOnly, setSelectedOpenNowOnly] = useState(
    initialPrefs?.openNowOnly ?? false
  );
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  // Tracks whether this component instance has completed at least one
  // "key settled" pass yet - see the loadedKey block below. Plain state
  // (not a ref) because it's read and written during render, in that same
  // block - mutating a ref during render isn't safe under React's rules
  // (double-rendering in StrictMode, concurrent rendering discarding a
  // render pass), whereas conditionally calling a setState during render
  // is the documented pattern this whole block already follows.
  const [hasSettledKey, setHasSettledKey] = useState(false);
  // Ensures the scroll-position restore (see the effect below) only ever
  // fires once per mount, not on every later re-render once items loads.
  // A ref is correct here since it's only ever touched inside an effect,
  // never during render.
  const hasRestoredScrollRef = useRef(false);
  // Deliberately not reset alongside the filters below when switching
  // city/category (see the loadedKey block) - CategoryScreen stays mounted
  // across a category switch, so a granted location should persist rather
  // than re-prompting.
  const { status: locationStatus, coords: userCoords, requestLocation } = useUserLocation();
  // Tracks which (city, slug) pair the state above currently belongs to.
  const [loadedKey, setLoadedKey] = useState(null);

  // Real walking distance/duration for nearby candidates, fetched once
  // location is granted - see fetchWalkingDistances in walkingDistance.js
  // and POST /api/walking-distances on the server ("Real walking
  // distance/time" in claude/todo.md). walkingDistances is a Map of entry
  // id -> { distanceMeters, durationSeconds }, or null when not ready -
  // filterItems above already treats null the same as "use straight-line",
  // so nothing downstream needs to know why it's null (never fetched,
  // still loading, or the fetch failed - see walkingDistancesStatus for
  // that distinction, used only for the hint text below).
  const [walkingDistances, setWalkingDistances] = useState(null);
  const [walkingDistancesStatus, setWalkingDistancesStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  // Remembers the (key, origin) pair the last fetch was for, so a
  // re-render that doesn't actually change either doesn't re-fire the
  // effect below and re-request the same data.
  const walkingFetchKeyRef = useRef(null);

  // Reset items/sort/filters back to this category's defaults during
  // render when we've switched to a different city/category, rather than in
  // an effect - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (key !== loadedKey) {
    setLoadedKey(key);
    if (hasSettledKey) {
      setSortBy(config.sortOptions?.[0]?.value ?? null);
      setSelectedTypes(new Set());
      setSelectedPriceLevels(new Set());
      setSelectedRadiusKm(null);
      setSelectedOpenNowOnly(false);
    }
    // Cached derived data tied to `key`, not a user preference - unlike
    // the sort/filter selections above (deliberately preserved across the
    // very first settle so a saved selection can survive a fresh mount),
    // this resets unconditionally on every key change, since stale
    // distances from the previous city/category would otherwise sit
    // around and could get matched against by a coincidental id match.
    setWalkingDistances(null);
    setWalkingDistancesStatus('idle');
    walkingFetchKeyRef.current = null;

    setFilterPanelOpen(false);
    setHasSettledKey(true);
  }

  // Derived from the shared per-city cache (see CityDataProvider.jsx)
  // instead of firing its own fetch every time a category is visited.
  // Grouped categories (Activities) read cityData.activityTypes - each one
  // already carries its provider Entries (see GET
  // /api/cities/:cityId/activity-types) so activityTypeHref can decide
  // per-card whether to link to ActivityTypeDetail or straight to a
  // single provider. Everything else filters cityData.entries down to
  // this category client-side. null (not cityData.entries/[]) until
  // cityData has loaded for the current city at all, so the loading
  // spinner below still shows during that first fetch rather than briefly
  // rendering an empty list.
  const items = useMemo(() => {
    if (!cityData) return null;
    return config.groupedByType
      ? cityData.activityTypes
      : cityData.entries.filter((entry) => entry.category.slug === slug);
  }, [cityData, slug, config.groupedByType]);

  // Persists the current sort/filter selection for this exact city+category
  // (see loadSavedPrefs above) every time it changes, so it can be restored
  // on the next mount - e.g. navigating into EntryDetail.jsx and back.
  useEffect(() => {
    if (!key) return;
    try {
      sessionStorage.setItem(
        `categoryPrefs:${key}`,
        JSON.stringify({
          sortBy,
          types: Array.from(selectedTypes),
          priceLevels: Array.from(selectedPriceLevels),
          radiusKm: selectedRadiusKm,
          openNowOnly: selectedOpenNowOnly,
        })
      );
    } catch {
      // ignore - see loadSavedPrefs
    }
  }, [key, sortBy, selectedTypes, selectedPriceLevels, selectedRadiusKm, selectedOpenNowOnly]);

  // Continuously records scroll position while on this screen (so the very
  // last position before navigating into EntryDetail.jsx is captured, not
  // just whatever it was at some earlier point), keyed the same way as the
  // sort/filter prefs above.
  useEffect(() => {
    if (!key) return;
    function handleScroll() {
      saveScrollY(key, window.scrollY);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [key]);

  // Restores that scroll position once the list has actually rendered (a
  // restore attempted before `items` loads would just land at the top,
  // since the page has nothing to scroll yet) - guarded by
  // hasRestoredScrollRef so it fires at most once per mount, not every time
  // `items` happens to change identity later.
  useEffect(() => {
    if (hasRestoredScrollRef.current || !key || items === null) return;
    hasRestoredScrollRef.current = true;
    const savedY = loadScrollY(key);
    if (savedY != null) {
      requestAnimationFrame(() => window.scrollTo(0, savedY));
    }
  }, [key, items]);

  // Filter chip *values* come from whatever's actually present in this
  // city/category's items, not a fixed list - so a chip never appears for
  // a type or price level nothing currently uses. (Always empty for a
  // grouped category, since ActivityType rows have no `types`/`priceLevel`
  // - harmless, filterOptions is null there so nothing renders these.)
  const availableTypes = useMemo(() => {
    const set = new Set();
    (items ?? []).forEach((item) => {
      (item.types ?? []).forEach((t) => set.add(t));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const availablePriceLevels = useMemo(() => {
    const set = new Set();
    (items ?? []).forEach((item) => {
      if (item.priceLevel != null) set.add(item.priceLevel);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [items]);

  const hasCoordinateData = useMemo(
    () => (items ?? []).some((item) => item.latitude != null && item.longitude != null),
    [items]
  );
  const showDistanceFilter = Boolean(config.filterOptions?.includes('distance')) && hasCoordinateData;

  // Fetches real walking distance/duration for nearby candidates once
  // location is granted, for categories that actually offer the distance
  // filter. A denied/unavailable/idle location, or this category not
  // offering the filter at all, simply never fires this - walkingDistances
  // then stays null forever and filterItems already treats that as "use
  // straight-line" (see its doc comment above), so nothing else needs a
  // special case for that.
  useEffect(() => {
    if (!showDistanceFilter || locationStatus !== 'granted' || !userCoords || !items) return;

    // Cheap straight-line narrowing pass before ever calling the real API -
    // see WALKING_DISTANCE_PREFILTER_KM's comment above for why this is
    // deliberately looser than the largest radius chip.
    const candidates = items.filter(
      (item) =>
        item.latitude != null &&
        item.longitude != null &&
        haversineDistanceKm(
          userCoords.latitude,
          userCoords.longitude,
          item.latitude,
          item.longitude
        ) <= WALKING_DISTANCE_PREFILTER_KM
    );
    if (candidates.length === 0) return;

    // Only the city/category key and the origin coordinates are part of
    // "what distances do we need" - guards against re-fetching on a
    // render where neither changed (e.g. `items` getting a new array
    // identity from an unrelated cache update).
    const fetchKey = `${key}:${userCoords.latitude.toFixed(4)},${userCoords.longitude.toFixed(4)}`;
    if (walkingFetchKeyRef.current === fetchKey) return;
    walkingFetchKeyRef.current = fetchKey;

    let cancelled = false;
    setWalkingDistancesStatus('loading');
    fetchWalkingDistances(import.meta.env.VITE_API_URL, userCoords, candidates)
      .then((map) => {
        if (cancelled) return;
        setWalkingDistances(map);
        setWalkingDistancesStatus('ready');
      })
      .catch((err) => {
        // Falls back to the straight-line filter it already has, honestly
        // re-labeled as straight-line again (see the hint text below) -
        // must never silently show straight-line numbers under a "real
        // walking distance" label, which would reintroduce the exact
        // misleading-results problem this feature exists to fix.
        if (cancelled) return;
        console.error('Walking-distance lookup failed, falling back to straight-line:', err);
        walkingFetchKeyRef.current = null;
        setWalkingDistances(null);
        setWalkingDistancesStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [showDistanceFilter, locationStatus, userCoords, items, key]);

  // Only offered when the city has a timezone set (see categoryConfig.js's
  // 'openNow' doc comment) - without one, isOpenNow() would return null for
  // every entry and the filter would just always show zero results, a
  // confusing dead control rather than a useful one.
  const hasOpenNowData = useMemo(
    () => (items ?? []).some((item) => Boolean(item.openingTimes)),
    [items]
  );
  const showOpenNowFilter =
    Boolean(config.filterOptions?.includes('openNow')) && Boolean(city?.timezone) && hasOpenNowData;

  const hasFilterableData =
    availableTypes.length > 0 ||
    availablePriceLevels.length > 0 ||
    showDistanceFilter ||
    showOpenNowFilter;
  const activeFilterCount =
    selectedTypes.size +
    selectedPriceLevels.size +
    (selectedRadiusKm != null ? 1 : 0) +
    (selectedOpenNowOnly ? 1 : 0);

  const filteredItems = useMemo(
    () =>
      filterItems(items ?? [], {
        types: selectedTypes,
        priceLevels: selectedPriceLevels,
        radiusKm: selectedRadiusKm,
        origin: userCoords,
        openNowOnly: selectedOpenNowOnly,
        timezone: city?.timezone,
        // Only handed to filterItems once the fetch has actually
        // succeeded - 'loading'/'error'/'idle' all pass null here, which
        // filterItems treats the same as "not ready, use straight-line"
        // (see its doc comment above).
        walkingDistances: walkingDistancesStatus === 'ready' ? walkingDistances : null,
      }),
    [
      items,
      selectedTypes,
      selectedPriceLevels,
      selectedRadiusKm,
      userCoords,
      selectedOpenNowOnly,
      city?.timezone,
      walkingDistances,
      walkingDistancesStatus,
    ]
  );
  const sortedItems = useMemo(() => sortItems(filteredItems, sortBy), [filteredItems, sortBy]);

  function clearFilters() {
    setSelectedTypes(new Set());
    setSelectedPriceLevels(new Set());
    setSelectedRadiusKm(null);
    setSelectedOpenNowOnly(false);
  }

  return (
    <div className="category-screen">
      <div className="category-screen-header">
        <div className="category-screen-header-left">
          <Link to="/" className="category-screen-back" aria-label="Back to home">
            &larr;
          </Link>
          <h1 className="category-screen-title">{config.title ?? slug}</h1>
        </div>
        {/* Grouped categories don't offer "+ Add" here - a new ActivityType
            is created in Prisma Studio for now (a deliberate scope
            decision, same as sortOrder/rating/etc. - see ActivityType in
            schema.prisma). Adding a new *provider* within an existing type
            is still done in-app, via "+ Add provider" on
            ActivityTypeDetail.jsx. */}
        {!config.groupedByType && (
          <Link to={`/category/${slug}/entry/new/edit`} className="category-screen-add">
            + Add
          </Link>
        )}
      </div>

      {items !== null && items.length > 0 && (
        <div className="category-screen-count">
          {sortedItems.length === items.length
            ? `${items.length} ${items.length === 1 ? config.itemLabel : config.itemLabelPlural}`
            : `${sortedItems.length} of ${items.length} ${config.itemLabelPlural}`}
        </div>
      )}

      {(config.sortOptions || (config.filterOptions && hasFilterableData)) && (
        <div className="category-screen-controls">
          {config.sortOptions && (
            <div className="category-screen-sort">
              <label htmlFor="sort-select">Sort by</label>
              <select id="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                {config.sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {config.filterOptions && hasFilterableData && (
            <button
              type="button"
              className="category-screen-filter-toggle"
              aria-expanded={filterPanelOpen}
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </button>
          )}
        </div>
      )}

      {config.filterOptions && filterPanelOpen && hasFilterableData && (
        <div className="category-screen-filter-panel">
          {config.filterOptions.includes('types') && availableTypes.length > 0 && (
            <div className="category-screen-filter-group">
              <div className="category-screen-filter-group-label">
                {config.typeFilterLabel ?? 'Type'}
              </div>
              <div className="category-screen-filter-chips">
                {availableTypes.map((type) => (
                  <button
                    type="button"
                    key={type}
                    className="category-screen-filter-chip"
                    aria-pressed={selectedTypes.has(type)}
                    onClick={() => setSelectedTypes((prev) => toggleSetValue(prev, type))}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {config.filterOptions.includes('priceLevel') && availablePriceLevels.length > 0 && (
            <div className="category-screen-filter-group">
              <div className="category-screen-filter-group-label">Price</div>
              <div className="category-screen-filter-chips">
                {availablePriceLevels.map((level) => (
                  <button
                    type="button"
                    key={level}
                    className="category-screen-filter-chip"
                    aria-pressed={selectedPriceLevels.has(level)}
                    onClick={() => setSelectedPriceLevels((prev) => toggleSetValue(prev, level))}
                  >
                    {currencySymbol.repeat(level)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showDistanceFilter && (
            <div className="category-screen-filter-group">
              <div className="category-screen-filter-group-label">Distance</div>

              {locationStatus === 'idle' && (
                <button
                  type="button"
                  className="category-screen-location-button"
                  onClick={requestLocation}
                >
                  Use my location
                </button>
              )}

              {locationStatus === 'loading' && (
                <div className="category-screen-location-status">Finding your location…</div>
              )}

              {(locationStatus === 'denied' || locationStatus === 'unavailable') && (
                <div className="category-screen-location-status">
                  Couldn&apos;t access your location.{' '}
                  <button
                    type="button"
                    className="category-screen-filter-clear-inline"
                    onClick={requestLocation}
                  >
                    Try again
                  </button>
                </div>
              )}

              {locationStatus === 'granted' && (
                <>
                  <div className="category-screen-filter-chips">
                    {RADIUS_OPTIONS_KM.map((km) => (
                      <button
                        type="button"
                        key={km}
                        className="category-screen-filter-chip"
                        aria-pressed={selectedRadiusKm === km}
                        onClick={() => setSelectedRadiusKm((prev) => (prev === km ? null : km))}
                      >
                        Within {formatDistanceKm(km)}
                      </button>
                    ))}
                  </div>
                  {walkingDistancesStatus === 'loading' && (
                    <p className="category-screen-filter-hint">Getting real walking distances…</p>
                  )}
                  {walkingDistancesStatus === 'ready' && (
                    <p className="category-screen-filter-hint">Real walking distance.</p>
                  )}
                  {walkingDistancesStatus === 'error' && (
                    <p className="category-screen-filter-hint">
                      Couldn&apos;t get walking distances — showing straight-line instead (the
                      actual walk may be longer).
                    </p>
                  )}
                  {(walkingDistancesStatus === 'idle') && (
                    <p className="category-screen-filter-hint">
                      Straight-line distance — the actual walk may be longer.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {showOpenNowFilter && (
            <div className="category-screen-filter-group">
              <div className="category-screen-filter-group-label">Hours</div>
              <div className="category-screen-filter-chips">
                <button
                  type="button"
                  className="category-screen-filter-chip"
                  aria-pressed={selectedOpenNowOnly}
                  onClick={() => setSelectedOpenNowOnly((prev) => !prev)}
                >
                  Open now
                </button>
              </div>
            </div>
          )}

          {activeFilterCount > 0 && (
            <button type="button" className="category-screen-filter-clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {(cityLoading || items === null) && (
        <div className="category-screen-status">
          <div className="category-screen-spinner" aria-hidden="true" />
          <p>Loading…</p>
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="category-screen-status">Nothing here yet.</div>
      )}

      {items !== null && items.length > 0 && sortedItems.length === 0 && (
        <div className="category-screen-status">
          No matches for these filters.{' '}
          <button type="button" className="category-screen-filter-clear-inline" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {sortedItems.length > 0 && (
        <div className="category-screen-list">
          {/* expandInPlace categories (Local Cuisine, see categoryConfig.js)
              render EntryCard directly instead of wrapping it in a Link -
              the card manages its own expand/collapse and only navigates
              via its own "Edit" link, so there's no separate detail screen
              to tap through to. */}
          {sortedItems.map((item) =>
            config.expandInPlace ? (
              <EntryCard
                key={item.id}
                entry={item}
                variant={config.cardVariant}
                currencySymbol={currencySymbol}
                showPrice={config.cardShowPrice ?? true}
                showPhone={config.cardShowPhone ?? false}
                showOpenStatus={config.cardShowOpenStatus ?? false}
                timezone={city?.timezone}
                expandable
                editHref={`/category/${slug}/entry/${item.id}/edit`}
              />
            ) : (
              <Link
                to={
                  config.groupedByType
                    ? activityTypeHref(slug, item)
                    : `/category/${slug}/entry/${item.id}`
                }
                className="entry-card-link"
                key={item.id}
              >
                <EntryCard
                  entry={item}
                  variant={config.cardVariant}
                  currencySymbol={currencySymbol}
                  showPrice={config.cardShowPrice ?? true}
                  showPhone={config.cardShowPhone ?? false}
                  showOpenStatus={config.cardShowOpenStatus ?? false}
                  timezone={city?.timezone}
                />
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default CategoryScreen;
