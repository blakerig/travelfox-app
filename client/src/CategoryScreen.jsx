import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './CategoryScreen.css';
import { useCity } from './city-context.js';
import { getCategoryConfig } from './categoryConfig.js';
import EntryCard from './EntryCard.jsx';
import { haversineDistanceKm, formatDistanceKm } from './geo.js';
import { useUserLocation } from './useUserLocation.js';
import { activityTypeHref } from './activityTypeHref.js';

// Radius choices for the Eating Out distance filter (2026-08-28) - single
// select (tapping the active one again clears it), not the OR-multi-select
// pattern cuisine/price chips use, since a radius is a cumulative cutoff
// ("within 2km") rather than a set of independent options.
const RADIUS_OPTIONS_KM = [0.5, 1, 2, 5];

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
// Distance uses straight-line (haversine) distance from `origin` (the
// user's geolocated position, see useUserLocation.js) - a coarse, honestly
// approximate cutoff, not real walking distance. See geo.js and the
// 'distance' note in categoryConfig.js for why this is a filter only, not
// also a sort.
//
// A grouped category (Activities) never has any dimension active - no UI
// drives filterOptions there (see categoryConfig.js) - so this returns
// early before touching any ActivityType-shaped item.
function filterItems(items, { types, priceLevels, radiusKm, origin }) {
  if (types.size === 0 && priceLevels.size === 0 && radiusKm == null) return items;
  return items.filter((entry) => {
    const typeOk = types.size === 0 || (entry.types ?? []).some((t) => types.has(t));
    const priceOk =
      priceLevels.size === 0 || (entry.priceLevel != null && priceLevels.has(entry.priceLevel));
    const distanceOk =
      radiusKm == null ||
      (origin &&
        entry.latitude != null &&
        entry.longitude != null &&
        haversineDistanceKm(origin.latitude, origin.longitude, entry.latitude, entry.longitude) <=
          radiusKm);
    return typeOk && priceOk && distanceOk;
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
  const config = getCategoryConfig(slug);
  const key = city ? `${city.id}:${slug}` : null;
  const currencySymbol = city?.country?.currencySymbol || '$';

  const [items, setItems] = useState(null);
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

  // Reset items/sort/filters back to this category's defaults during
  // render when we've switched to a different city/category, rather than in
  // an effect - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (key !== loadedKey) {
    setLoadedKey(key);
    setItems(null);
    if (hasSettledKey) {
      setSortBy(config.sortOptions?.[0]?.value ?? null);
      setSelectedTypes(new Set());
      setSelectedPriceLevels(new Set());
      setSelectedRadiusKm(null);
    }
    setFilterPanelOpen(false);
    setHasSettledKey(true);
  }

  useEffect(() => {
    if (!city) return;
    // Grouped categories (Activities) fetch ActivityType rows - each one
    // already carries its provider Entries (see GET
    // /api/cities/:cityId/activity-types) so activityTypeHref can decide
    // per-card whether to link to ActivityTypeDetail or straight to a
    // single provider without a second round-trip.
    const url = config.groupedByType
      ? `${import.meta.env.VITE_API_URL}/api/cities/${city.id}/activity-types`
      : `${import.meta.env.VITE_API_URL}/api/cities/${city.id}/entries?category=${slug}`;
    fetch(url)
      .then((res) => res.json())
      .then(setItems)
      .catch((err) => console.error('Failed to fetch category items:', err));
  }, [city, slug, config.groupedByType]);

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
        })
      );
    } catch {
      // ignore - see loadSavedPrefs
    }
  }, [key, sortBy, selectedTypes, selectedPriceLevels, selectedRadiusKm]);

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

  const hasFilterableData =
    availableTypes.length > 0 || availablePriceLevels.length > 0 || showDistanceFilter;
  const activeFilterCount =
    selectedTypes.size + selectedPriceLevels.size + (selectedRadiusKm != null ? 1 : 0);

  const filteredItems = useMemo(
    () =>
      filterItems(items ?? [], {
        types: selectedTypes,
        priceLevels: selectedPriceLevels,
        radiusKm: selectedRadiusKm,
        origin: userCoords,
      }),
    [items, selectedTypes, selectedPriceLevels, selectedRadiusKm, userCoords]
  );
  const sortedItems = useMemo(() => sortItems(filteredItems, sortBy), [filteredItems, sortBy]);

  function clearFilters() {
    setSelectedTypes(new Set());
    setSelectedPriceLevels(new Set());
    setSelectedRadiusKm(null);
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
                  <p className="category-screen-filter-hint">
                    Straight-line distance — the actual walk may be longer.
                  </p>
                </>
              )}
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
