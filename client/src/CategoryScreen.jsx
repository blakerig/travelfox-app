import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import './CategoryScreen.css';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import { useAuth } from './auth-context.js';
import { getCategoryConfig } from './categoryConfig.js';
import EntryCard from './EntryCard.jsx';
import { haversineDistanceKm, formatDistanceKm } from './geo.js';
import { fetchWalkingDistances } from './walkingDistance.js';
import { useUserLocation } from './useUserLocation.js';
import { activityTypeHref } from './activityTypeHref.js';
import { isOpenNow } from './openingHours.js';
import EssentialsHolidaysRow from './EssentialsHolidaysRow.jsx';
import FilterSheet from './FilterSheet.jsx';

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

// How close the user needs to be to a city's own stored coordinates
// (City.latitude/longitude) before "Nearest" (see sortItems above) is
// allowed to drive the sort order at all, rather than quietly falling back
// to Recommended (2026-09-15, Blake: "obviously this should only be done if
// the user is close enough... not if they are planning a trip from another
// city"). Same value and "same metro area" reasoning as
// MAX_USER_LOCATION_DISTANCE_KM in EntryLocationMap.jsx - a coarse cutoff,
// not a precisely researched one, kept consistent across the app rather
// than introducing a second number to reason about. See nearestUsable
// below for how this actually gets checked.
const NEAREST_SORT_MAX_CITY_DISTANCE_KM = 50;

// Sorting is done client-side for now - lists are small in v1 and this
// avoids adding server-side sort-param parsing before it's actually needed.
// Revisit (move to the API, via ?sort=) if item counts grow enough to matter.
//
// sortBy === 'curated' (see categoryConfig.js) is deliberately not handled
// here - falling through leaves `items` in the order the server returned
// them, i.e. Entry.sortOrder (see GET /api/cities/:cityId/entries), so
// "Recommended" just means "however it was hand-ordered in Prisma Studio."
//
// sortBy === 'nearest' (2026-09-15, Eating Out/Sightseeing - see
// SORT_NEAREST_CURATED_NAME in categoryConfig.js) only actually reorders
// when `nearestUsable` is true (computed in CategoryScreen from location
// status + how close the user is judged to be to this city - see that
// component for the full reasoning); otherwise it falls through to the
// exact same pass-through as 'curated' above, so selecting "Nearest" before
// it's usable never produces a broken or nonsensical order, just the
// existing Recommended one, with the UI explaining why via the hint text
// rendered alongside the sort control.
//
// When usable, nearestSortKey below produces a three-tier ordering rather
// than a flat comparison: entries with a real walking *duration* (from
// `walkingDistances`, the same Matrix data already fetched for the distance
// filter/card walking time - see the walkingDistances effect and
// walkingMinutesFor further down) sort first, ascending, since that's an
// actual measured number; entries missing one (outside the Matrix request's
// pre-filter/destination cap, or ORS not yet configured at all - see
// claude/todo.md) fall back to straight-line distance from `origin` for
// relative ordering only - never displayed as if it were the real number,
// same "silent internal use only" treatment WALKING_DISTANCE_PREFILTER_KM
// already gets - and sort after every entry that does have real data, via
// NEAREST_FALLBACK_OFFSET_SECONDS (chosen well above any plausible real
// walking duration, so the two tiers never interleave); entries with no
// coordinates at all - so no distance of any kind can be computed - sort
// last, in whatever relative order they were already in (JS's stable sort
// leaves ties in their prior order, so this is quietly stable rather than
// re-shuffling them each time).
//
// For a grouped category (Activities, see groupedByType in
// categoryConfig.js) sortBy is always null - this just falls through the
// `!sortBy` guard below and leaves the server's ActivityType.sortOrder
// order untouched, same mechanism one level up.
const NEAREST_FALLBACK_OFFSET_SECONDS = 1_000_000;

function nearestSortKey(item, { walkingDistances, origin }) {
  const realDurationSeconds = walkingDistances?.get(item.id)?.durationSeconds;
  if (realDurationSeconds != null) return realDurationSeconds;
  if (origin && item.latitude != null && item.longitude != null) {
    return (
      NEAREST_FALLBACK_OFFSET_SECONDS +
      haversineDistanceKm(origin.latitude, origin.longitude, item.latitude, item.longitude)
    );
  }
  return Infinity;
}

function sortItems(items, sortBy, nearestContext) {
  if (!sortBy) return items;
  const sorted = items.slice();
  if (sortBy === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'nearest' && nearestContext?.nearestUsable) {
    sorted.sort(
      (a, b) => nearestSortKey(a, nearestContext) - nearestSortKey(b, nearestContext)
    );
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
// Activities (see categoryConfig.js) has no filter dimension at all any
// more (2026-10-23) - its one dimension, 'activityGroup', was replaced by
// always-on sectioning (see CategoryScreen's activityGroupSections and
// categoryConfig.js's sectionByGroup) rather than a chip that hides every
// other group. ActivityType rows still don't carry `types`/`priceLevel`/
// coordinates/openingTimes, so typeOk/priceOk/distanceOk/openNowOk below
// all just pass through as true for them, same as before either dimension
// existed.
function filterItems(
  items,
  { types, priceLevels, radiusKm, origin, openNowOnly, timezone, walkingDistances }
) {
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

// Collapses sibling ActivityType rows that share an ActivityTypeCluster
// (e.g. Padel/Squash/Tennis/Badminton under "Racquet Sports") into one row
// rendered as a single navigable card, instead of each getting its own
// top-level card - added 2026-10-17, see ActivityTypeCluster in
// schema.prisma. Tapping that card goes to ActivityClusterDetail.jsx,
// which lists the members. Grouped by first-occurrence position in
// `items` (not a separate pass over cluster.sortOrder) so a cluster's
// position in the list is wherever its first/highest-sorted member would
// have landed on its own - correct regardless of which sort is active,
// same as any other row.
//
// A cluster with only one member actually present renders as a plain
// standalone item instead (see the single-member rows re-flattened below)
// - nesting pays off once there's something to collapse, not before. A
// city can have "Padel" clustered under "Racquet Sports" long before
// "Squash" exists there, and it should still just look like an ordinary
// card until a second sibling shows up.
//
// Extracted into its own function (2026-10-23, previously inline in
// CategoryScreen's displayRows) so activityGroupSections below can call it
// once per ActivityGroup section - a cluster's members are collapsed
// within whichever group section they landed in, not across the whole
// page, so two siblings that were (unusually) given different groups
// would each render as their own single-item card in their own section
// rather than being nested together. Harmless no-op for a non-cluster-
// using category (ShopType rows have no `.cluster`, so every row falls
// through to the plain 'item' case) - called from the flat displayRows
// path below too, so every category shares this one implementation.
function buildDisplayRows(items) {
  const rows = [];
  const clusterRows = new Map(); // clusterId -> the row object already pushed into rows
  items.forEach((item) => {
    if (item.cluster) {
      let row = clusterRows.get(item.cluster.id);
      if (!row) {
        row = { type: 'cluster', cluster: item.cluster, members: [] };
        clusterRows.set(item.cluster.id, row);
        rows.push(row);
      }
      row.members.push(item);
    } else {
      rows.push({ type: 'item', item });
    }
  });
  return rows.flatMap((row) =>
    row.type === 'cluster' && row.members.length === 1
      ? [{ type: 'item', item: row.members[0] }]
      : [row]
  );
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
// - header, count line, loading/empty states - is unchanged, and the sort
// machinery below safely no-ops for this case, since Activities sets
// sortOptions to null. It also renders its ActivityType cards sectioned by
// ActivityGroup (`sectionByGroup`, 2026-10-23, replacing an earlier
// single-select `activityGroup` filter chip row from 2026-09-10 - see
// activityGroupSections below and the doc comment on the `activities`
// entry in categoryConfig.js for the full history/reasoning) rather than
// as one flat list.
function CategoryScreen() {
  const { slug } = useParams();
  const { city, loading: cityLoading } = useCity();
  const { canEdit } = useAuth();
  const { cityData } = useCityData();
  const config = getCategoryConfig(slug);
  // Coarser than showDistanceFilter below (doesn't also require
  // hasCoordinateData, which needs `items` to be loaded first) - just
  // enough to know, before useUserLocation() is called, whether this
  // category could ever want real walking distances at all. See the
  // autoFetchIfGranted argument below for what this actually gates.
  const categoryHasDistanceFilter = Boolean(config.filterOptions?.includes('distance'));
  const key = city ? `${city.id}:${slug}` : null;
  const currencySymbol = city?.country?.currencySymbol || '$';
  const countryCode = city?.country?.code;
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
  // Which of activityGroupSections' sections (below) are currently
  // collapsed, by section key (an ActivityGroup slug, or 'other' for the
  // ungrouped section) - added 2026-10-23 per Blake's request, right after
  // the sections themselves. A Set, not a single value, since any number
  // of sections can be collapsed independently. Persisted the same way as
  // the sort/filter selections above (see the sessionStorage effect
  // below) so collapsing, say, Fun & Entertainment survives navigating
  // into an ActivityTypeDetail and back - same reasoning as scroll
  // position being restored there. Always empty, and never rendered
  // against, for a category that isn't sectioned this way.
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => new Set(initialPrefs?.collapsedGroups ?? [])
  );
  // Which filter-dimension sheet (if any) is currently open - null, or one
  // of config.filterOptions' values ('types'/'priceLevel'/'distance'/
  // 'openNow'). Replaces the old single filterPanelOpen boolean (2026-10-02
  // redesign, see the horizontal category-screen-filter-bar row and
  // FilterSheet.jsx below): Blake found the previous design - one "Filters"
  // toggle that, once opened, stacked every dimension into one long panel -
  // overwhelming and unclear how to back out of, and asked for a Michelin-
  // Guide-style pattern instead (a horizontal row of filter-category pills,
  // each opening a focused sheet for just that one dimension, dismissed by
  // swiping it down). Only one dimension's sheet can be open at a time, so
  // a single nullable value is enough - no need for four separate booleans.
  const [openFilterSheet, setOpenFilterSheet] = useState(null);
  // Current sort's label, shown on the pill itself (see the render below).
  const sortLabel = config.sortOptions?.find((opt) => opt.value === sortBy)?.label ?? '';
  // Sort's own small dropdown panel (2026-10-17, replacing the native
  // <select>-overlay approach - see the .category-screen-filter-bar-chip--
  // sort doc comment in CategoryScreen.css for the full history of why:
  // the <select>'s open popup is a separate browser/OS-rendered surface
  // that this app's CSS can't reliably reach - padding on its <option>s
  // was confirmed not honored on Blake's real Windows Chrome/Edge, and
  // that was the one piece of spacing Blake actually needed control over.
  // This is a fully custom, app-rendered list instead: a plain styled
  // panel of option rows, positioned with real CSS this app does control.
  //
  // sortMenuOpen/sortMenuPos: whether the panel is open, and (while open)
  // its on-screen position - computed once, on open, from the trigger
  // button's own getBoundingClientRect(), rather than relying on normal
  // CSS layout flow. That's deliberate: the trigger lives inside
  // .category-screen-filter-bar-chips, which needs its own horizontal
  // scrolling (overflow-x: auto) for the filter-dimension pills next to
  // it - and setting overflow-x without overflow-y makes a browser treat
  // overflow-y as auto too (not visible), so a panel positioned as a
  // normal absolutely-positioned child of that row would get clipped the
  // moment it extended below the row's own one-line height. Rendering the
  // panel through a portal straight onto <body>, positioned with
  // `position: fixed` at coordinates read directly off the trigger,
  // sidesteps that clipping entirely rather than fighting it with CSS.
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortMenuPos, setSortMenuPos] = useState(null);
  const sortTriggerRef = useRef(null);
  const sortMenuRef = useRef(null);
  const openSortMenu = () => {
    const rect = sortTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSortMenuPos({ top: rect.bottom + 6, left: rect.left, minWidth: rect.width });
    setSortMenuOpen(true);
  };
  const chooseSortOption = (value) => {
    setSortBy(value);
    setSortMenuOpen(false);
  };
  // Closes on an outside tap/click, Escape, or the page scrolling under
  // it (simplest correct behaviour for a panel whose position is
  // computed once rather than tracked live - re-opening after a scroll
  // is one tap away, same as any other dropdown). Checked against both
  // the trigger and the panel itself, since the panel is portaled onto
  // <body> and so isn't inside the trigger's own DOM subtree for a plain
  // .contains() check on the trigger alone to cover it.
  useEffect(() => {
    if (!sortMenuOpen) return;
    const handlePointerDown = (e) => {
      if (sortTriggerRef.current?.contains(e.target)) return;
      if (sortMenuRef.current?.contains(e.target)) return;
      setSortMenuOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSortMenuOpen(false);
    };
    const handleScroll = () => setSortMenuOpen(false);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [sortMenuOpen]);
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
  //
  // autoFetchIfGranted: categoryHasDistanceFilter (2026-09-15, added so
  // Eating Out/Sightseeing cards can show real walking time - see
  // walkingMinutesFor below - without anyone having to open the Filters
  // panel first) - once the browser has already granted this site location
  // access (e.g. from a previous visit, or from EntryWalkingTime.jsx on an
  // entry-detail screen), locationStatus goes straight to 'granted' on
  // mount instead of sitting at 'idle' until someone taps "Use my
  // location", which in turn lets the walking-distances effect below fire
  // automatically. See the autoFetchIfGranted doc comment in
  // useUserLocation.js for why this never reintroduces the location
  // prompt itself - it only skips the wait once permission already exists.
  // Gated to categories that actually offer the distance filter (rather
  // than passed unconditionally) so Essentials/Activities/Shopping/Local
  // Cuisine don't fire a pointless geolocation lookup on every visit for a
  // number they'd never use.
  //
  // highAccuracy/maxCacheAgeMs (2026-10-14, see the doc comments on each
  // in useUserLocation.js) - tightened after Blake reported inaccurate
  // walking-time readings; this filter/card data has the same "how close
  // am I right now" requirement EntryWalkingTime.jsx does, so it gets the
  // same real-GPS, short-cache treatment. Deliberately NOT also opting
  // into refreshOnVisible here, unlike EntryWalkingTime.jsx - a refreshed
  // position on this screen re-triggers the walking-distances effect below
  // and spends a fresh OpenRouteService Matrix call, and this screen can
  // legitimately stay open and in the background for a long browsing
  // session (unlike a single entry-detail view), so auto-refreshing it on
  // every tab-refocus is a real cadence/quota decision worth making
  // deliberately rather than bundling in here - logged as a follow-up in
  // claude/todo.md if the card-level numbers turn out to go stale in
  // practice the same way.
  const { status: locationStatus, coords: userCoords, requestLocation } = useUserLocation({
    autoFetchIfGranted: categoryHasDistanceFilter,
    highAccuracy: true,
    maxCacheAgeMs: 60 * 1000,
  });
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
      setCollapsedGroups(new Set());
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

    setOpenFilterSheet(null);
    setHasSettledKey(true);
  }

  // Derived from the shared per-city cache (see CityDataProvider.jsx)
  // instead of firing its own fetch every time a category is visited. A
  // grouped category (Activities, and since 2026-09-15 Shopping) reads its
  // own slice of the bundle - config.groupedTypeKey says which
  // ('activityTypes'/'shopTypes', see categoryConfig.js; falls back to
  // 'activityTypes' for a config written before that field existed). Each
  // row already carries its provider Entries (see GET
  // /api/cities/:cityId/activity-types / .../shop-types) so
  // activityTypeHref can decide per-card whether to link to the type's own
  // detail screen or straight to a single provider. Everything else
  // filters cityData.entries down to this category client-side. null (not
  // cityData.entries/[]) until cityData has loaded for the current city at
  // all, so the loading spinner below still shows during that first fetch
  // rather than briefly rendering an empty list.
  const items = useMemo(() => {
    if (!cityData) return null;
    return config.groupedByType
      ? cityData[config.groupedTypeKey ?? 'activityTypes']
      : cityData.entries.filter((entry) => entry.category.slug === slug);
  }, [cityData, slug, config.groupedByType, config.groupedTypeKey]);

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
          collapsedGroups: Array.from(collapsedGroups),
        })
      );
    } catch {
      // ignore - see loadSavedPrefs
    }
  }, [
    key,
    sortBy,
    selectedTypes,
    selectedPriceLevels,
    selectedRadiusKm,
    selectedOpenNowOnly,
    collapsedGroups,
  ]);

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

  // Which ActivityGroups (Sport & Active, Culture & Arts, ...) are actually
  // present among this city's ActivityType rows - drives the order/set of
  // section headings in activityGroupSections below (2026-10-23; until
  // then this fed a single-select filter chip row instead - same "don't
  // show a section nothing currently uses" principle as availableTypes/
  // availablePriceLevels above still applies, just to sections now rather
  // than chips). Sorted by ActivityGroup.sortOrder rather than
  // alphabetically - see that field's comment in schema.prisma. Always
  // empty for a category that isn't sectioned this way.
  const availableActivityGroups = useMemo(() => {
    if (!config.sectionByGroup) return [];
    const bySlug = new Map();
    (items ?? []).forEach((item) => {
      if (item.group) bySlug.set(item.group.slug, item.group);
    });
    return Array.from(bySlug.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
  }, [items, config.sectionByGroup]);

  const hasCoordinateData = useMemo(
    () => (items ?? []).some((item) => item.latitude != null && item.longitude != null),
    [items]
  );
  const showDistanceFilter = Boolean(config.filterOptions?.includes('distance')) && hasCoordinateData;

  // Whether "Nearest" (see sortItems/SORT_NEAREST_CURATED_NAME) is allowed
  // to actually drive the sort order right now, as opposed to gracefully
  // falling back to Recommended - 2026-09-15, see NEAREST_SORT_MAX_CITY_
  // DISTANCE_KM's comment above for the full reasoning. Three things all
  // have to be true: this category offers real distance data at all
  // (categoryHasDistanceFilter - Eating Out/Sightseeing only), the user has
  // actually granted location (not idle/loading/denied/unavailable), and
  // they're judged close enough to *this city* specifically - compared
  // against City.latitude/longitude (always set, unlike Entry's, which is
  // why this doesn't need the hasCoordinateData-style "does the data even
  // exist" guard the entry-level checks elsewhere need). That last check is
  // what stops Nearest from silently sorting by a meaningless few-hundred-km
  // number for someone browsing this city's page while they're actually
  // still at home planning a trip.
  const distanceFromCityCenterKm =
    userCoords && city
      ? haversineDistanceKm(userCoords.latitude, userCoords.longitude, city.latitude, city.longitude)
      : null;
  const nearestUsable =
    categoryHasDistanceFilter &&
    locationStatus === 'granted' &&
    userCoords != null &&
    distanceFromCityCenterKm != null &&
    distanceFromCityCenterKm <= NEAREST_SORT_MAX_CITY_DISTANCE_KM;

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
  // Per-dimension "does this pill have an active selection" flags, for the
  // filter-bar pill fill state and for deciding whether that dimension's
  // sheet gets a "Clear" action - a dimension with nothing selected has
  // nothing to clear, same as the old panel's single clear button only
  // appearing once activeFilterCount > 0.
  const typesActive = selectedTypes.size > 0;
  const priceActive = selectedPriceLevels.size > 0;
  const distanceActive = selectedRadiusKm != null;
  const openNowActive = selectedOpenNowOnly;

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
  // Same "only once the fetch has actually succeeded" treatment as
  // filteredItems' own walkingDistances above - nearestSortKey (in
  // sortItems) falls back to straight-line for anything missing from the
  // Map, and 'loading'/'error'/'idle' should all read as "missing" here too,
  // not as an empty-but-ready Map.
  const sortedItems = useMemo(
    () =>
      sortItems(filteredItems, sortBy, {
        nearestUsable,
        walkingDistances: walkingDistancesStatus === 'ready' ? walkingDistances : null,
        origin: userCoords,
      }),
    [filteredItems, sortBy, nearestUsable, walkingDistances, walkingDistancesStatus, userCoords]
  );

  // Flat row list for a groupedByType category that ISN'T also sectioned by
  // ActivityGroup (Shopping's ShopType rows - see sectionByGroup in
  // categoryConfig.js) and for every ordinary, non-grouped category -
  // see buildDisplayRows above for the cluster-collapsing it does. Rendered
  // directly in the list below when activityGroupSections (next) is null.
  const displayRows = useMemo(() => {
    if (!config.groupedByType) return sortedItems.map((item) => ({ type: 'item', item }));
    return buildDisplayRows(sortedItems);
  }, [sortedItems, config.groupedByType]);

  // Sections Activities' ActivityType cards by ActivityGroup (2026-10-23,
  // see sectionByGroup in categoryConfig.js) - replaces the earlier
  // single-select activityGroup filter chip, which hid every group but the
  // one selected. Each section's rows are built the same way the flat
  // displayRows above is (buildDisplayRows), just scoped to that one
  // group's own slice of sortedItems first - so Racquet-Sports-style
  // clustering still collapses correctly within a group rather than
  // (unusually) across two different groups' siblings. Ordered to match
  // availableActivityGroups (itself sorted by ActivityGroup.sortOrder, the
  // same order the old chip row used), with an "Other" section for any
  // ActivityType with no group assigned appended last - rather than
  // silently dropping it from the page, see categoryConfig.js's
  // sectionByGroup doc comment. A group with nothing currently in it is
  // left out entirely (same "don't show an empty thing" principle
  // availableActivityGroups itself already applies) rather than rendering
  // an empty heading. null (not []) for every other category, so the
  // render below can tell "sectioned" apart from "flat" with one check.
  const activityGroupSections = useMemo(() => {
    if (!config.sectionByGroup) return null;
    const bySlug = new Map(); // group slug, or null for ungrouped -> items
    sortedItems.forEach((item) => {
      const slug = item.group?.slug ?? null;
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug).push(item);
    });
    const sections = availableActivityGroups
      .map((group) => ({
        key: group.slug,
        label: group.name,
        rows: buildDisplayRows(bySlug.get(group.slug) ?? []),
      }))
      .filter((section) => section.rows.length > 0);
    const ungrouped = bySlug.get(null) ?? [];
    if (ungrouped.length > 0) {
      sections.push({ key: 'other', label: 'Other', rows: buildDisplayRows(ungrouped) });
    }
    return sections;
  }, [sortedItems, config.sectionByGroup, availableActivityGroups]);

  // Real walking minutes for one card, or null when there isn't a real
  // number to show (2026-09-15, see the walkingMinutes doc comment in
  // EntryCard.jsx) - reads the same `walkingDistances` Map the distance
  // filter already fetches (see the effect above), so this is never an
  // extra per-card request, just a lookup into data that's either already
  // there or isn't. Deliberately returns null rather than a straight-line
  // estimate for anything not in the Map - not granted/loaded yet, outside
  // the Matrix request's ~50-destination cap for a very large list, or ORS
  // genuinely couldn't route there on foot - same "omit rather than show
  // a number that might be misleadingly precise" choice the prop's own doc
  // comment explains.
  function walkingMinutesFor(item) {
    if (walkingDistancesStatus !== 'ready') return null;
    const durationSeconds = walkingDistances?.get(item.id)?.durationSeconds;
    return durationSeconds != null ? Math.round(durationSeconds / 60) : null;
  }

  function clearFilters() {
    setSelectedTypes(new Set());
    setSelectedPriceLevels(new Set());
    setSelectedRadiusKm(null);
    setSelectedOpenNowOnly(false);
  }

  // Per-dimension clears for each FilterSheet's own "Clear" action (2026-
  // 10-02) - deliberately separate from clearFilters above (which clears
  // every dimension at once, still used by the "Clear filters" link in the
  // sort/controls row and the "No matches" empty state) since clearing the
  // sheet you're actually looking at shouldn't silently reset dimensions
  // you can't currently see.
  function clearTypesFilter() {
    setSelectedTypes(new Set());
  }
  function clearPriceLevelsFilter() {
    setSelectedPriceLevels(new Set());
  }
  function clearDistanceFilter() {
    setSelectedRadiusKm(null);
  }
  function clearOpenNowFilter() {
    setSelectedOpenNowOnly(false);
  }

  // Toggles one activityGroupSections section open/closed by its key
  // (2026-10-23) - see collapsedGroups above.
  function toggleGroupSection(sectionKey) {
    setCollapsedGroups((prev) => toggleSetValue(prev, sectionKey));
  }

  // Renders one row from buildDisplayRows (a 'cluster' or plain 'item') as
  // a card - shared by both the flat displayRows list and every section
  // of activityGroupSections below, so there's exactly one place this
  // markup lives. expandInPlace categories (Local Cuisine, see
  // categoryConfig.js) render EntryCard directly instead of wrapping it in
  // a Link - the card manages its own expand/collapse and only navigates
  // via its own "Edit" link, so there's no separate detail screen to tap
  // through to. A 'cluster' row renders as one ordinary-looking EntryCard
  // too, just built from a synthetic entry-shaped object standing in for
  // the cluster itself (name plus every member's providers pooled
  // together for the count line - 'group' only reads entry.entries.length,
  // never the contents) - tapping it goes to ActivityClusterDetail.jsx
  // rather than ActivityTypeDetail.
  function renderRow(row) {
    if (row.type === 'cluster') {
      const clusterEntry = {
        id: `cluster-${row.cluster.id}`,
        name: row.cluster.name,
        description: null,
        summary: null,
        entries: row.members.flatMap((member) => member.entries ?? []),
      };
      return (
        <Link
          to={`/category/${slug}/cluster/${row.cluster.id}`}
          className="entry-card-link"
          key={`cluster-${row.cluster.id}`}
        >
          <EntryCard
            entry={clusterEntry}
            variant={config.cardVariant}
            currencySymbol={currencySymbol}
            countryCode={countryCode}
            city={city}
          />
        </Link>
      );
    }
    const item = row.item;
    return config.expandInPlace ? (
      <EntryCard
        key={item.id}
        entry={item}
        variant={config.cardVariant}
        currencySymbol={currencySymbol}
        showPrice={config.cardShowPrice ?? true}
        showPhone={config.cardShowPhone ?? false}
        countryCode={countryCode}
        showOpenStatus={config.cardShowOpenStatus ?? false}
        timezone={city?.timezone}
        city={city}
        walkingMinutes={walkingMinutesFor(item)}
        expandable
        editHref={canEdit ? `/category/${slug}/entry/${item.id}/edit` : undefined}
      />
    ) : (
      <Link
        to={
          config.groupedByType ? activityTypeHref(slug, item) : `/category/${slug}/entry/${item.id}`
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
          countryCode={countryCode}
          city={city}
          showOpenStatus={config.cardShowOpenStatus ?? false}
          timezone={city?.timezone}
          walkingMinutes={walkingMinutesFor(item)}
        />
      </Link>
    );
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
        {/* Only a team member who can actually edit ever sees "+ Add" -
            not just visually hidden, this is the only place the link is
            rendered at all for a public visitor or a Tester account (see
            canEdit in auth-context.js). See claude/todo.md.
            Grouped categories (Activities) get their own differently-
            labeled link that creates a new ActivityType (e.g. "Escape
            Rooms") via ActivityTypeEditor.jsx, rather than a bare Entry -
            added 2026-09-14 so this no longer has to go through Prisma
            Studio (see ActivityType in schema.prisma). Adding a
            *provider* within an existing type is still a separate action,
            via "+ Add provider" on ActivityTypeDetail.jsx. */}
        {canEdit && (
          <Link
            to={
              config.groupedByType
                ? `/category/${slug}/type/new/edit`
                : `/category/${slug}/entry/new/edit`
            }
            className="category-screen-add"
          >
            {config.groupedByType ? '+ Add type' : '+ Add'}
          </Link>
        )}
      </div>

      {/* Public Holidays preview row (2026-09-11, Essentials only) - not
          Entry-backed like the rest of this screen, so it's a separate
          component with its own fetch/loading rather than folded into the
          items/sortedItems logic below - see EssentialsHolidaysRow.jsx and
          claude/public-holidays-spec.md. Renders nothing on its own if the
          city's country has no holiday data yet, so it's safe to always
          mount here rather than gating it on anything about the Entry list. */}
      {slug === 'essentials' && (
        <div className="category-screen-holidays-row">
          <EssentialsHolidaysRow />
        </div>
      )}

      {/* Essentials skips the count line (2026-09-12) - it doesn't sort or
          filter, so "X items" never conveys anything useful, unlike
          Activities/Eating Out/etc. where it also reports filtered counts. */}
      {items !== null && items.length > 0 && slug !== 'essentials' && (
        <div className="category-screen-count">
          {sortedItems.length === items.length
            ? `${items.length} ${items.length === 1 ? config.itemLabel : config.itemLabelPlural}`
            : `${sortedItems.length} of ${items.length} ${config.itemLabelPlural}`}
        </div>
      )}

      {/* Sort + filter-category pill row (2026-10-02, combined 2026-10-03
          per Blake's request to put "Sort by" on the same row as the
          filter pills rather than its own row above - the full-width
          <select> that used to live in a separate category-screen-controls
          row was too wide to just drop in here as-is). One pill per filter
          dimension this category actually offers data for (same
          per-dimension gating the old panel used: availableTypes.length,
          availablePriceLevels.length, showDistanceFilter,
          showOpenNowFilter), each opening that one dimension's FilterSheet
          below. "Clear filters" moved into this same row too, as a fixed
          (non-scrolling) button at the end of the row - flex: 0 0 auto in
          the CSS, so it never scrolls out of reach alongside the dimension
          pills, which do scroll.

          Sort itself (2026-10-02, chevron added the same day) originally
          opened the same FilterSheet-style full-screen bottom sheet as the
          filter-dimension pills; once the chevron made it obvious this
          pill opens *something*, that felt like the wrong amount of UI
          for a plain three-item single-select list, so it moved (still
          2026-10-02) to a dropdown anchored right under the pill instead.

          That dropdown went through a native <select> first (2026-10-17),
          then a custom-built panel the same day, after the <select>'s own
          open popup turned out to be a dead end for one specific thing
          Blake needed: comfortable padding around each option row. Along
          the way the <select> approach was made to visually match the
          other pills exactly (a div carrying the same
          category-screen-filter-bar-chip class as every other pill, with
          the <select> itself reduced to an invisible full-pill tap
          overlay) - see the .category-screen-filter-bar-chip--sort doc
          comment in CategoryScreen.css for that whole saga - but a
          <select>'s open list is a separate browser/OS-rendered surface
          outside the page's own box model, and padding on its <option>s
          was confirmed not honored on Blake's real Windows Chrome/Edge.
          Since that's precisely the thing being asked for, no amount of
          further CSS tweaking was going to get there.

          Final approach: the pill is now a plain <button> (still sharing
          category-screen-filter-bar-chip/--sort, so its box model is
          identical to the rest of the row, same as before) that opens a
          fully custom, app-rendered dropdown panel on click -
          .category-screen-sort-menu below, portaled onto <body> and
          positioned from the button's own getBoundingClientRect() (see
          the sortMenuOpen/openSortMenu doc comment above the state
          declarations for why a portal rather than a normal nested div).
          Every pixel of that panel - including the option padding this
          whole rebuild was for - is this app's own CSS now, nothing left
          to a browser/OS popup's own rendering. The filter-dimension
          pills below (types/price/distance/openNow) are unchanged - a
          bottom sheet still suits those, since several hold more content
          (a cuisine grid, radius options plus a location-permission
          state) than this small a panel could present well, and they can
          be "off" (nothing selected) unlike sort, which always has
          exactly one active value - that's also why they keep the green
          aria-pressed fill sort never used. */}
      {(config.sortOptions || (config.filterOptions && hasFilterableData)) && (
        <div className="category-screen-filter-bar">
          <div className="category-screen-filter-bar-chips">
            {config.sortOptions && (
              <button
                type="button"
                ref={sortTriggerRef}
                className="category-screen-filter-bar-chip category-screen-filter-bar-chip--sort"
                aria-label={`Sort by: ${sortLabel}`}
                aria-haspopup="listbox"
                aria-expanded={sortMenuOpen}
                onClick={() => (sortMenuOpen ? setSortMenuOpen(false) : openSortMenu())}
              >
                {sortLabel}
                <svg
                  className="category-screen-filter-bar-chip-chevron"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            {config.filterOptions?.includes('types') && availableTypes.length > 0 && (
              <button
                type="button"
                className="category-screen-filter-bar-chip"
                aria-pressed={typesActive}
                onClick={() => setOpenFilterSheet('types')}
              >
                {config.typeFilterLabel ?? 'Type'}
                {selectedTypes.size > 0 ? ` · ${selectedTypes.size}` : ''}
              </button>
            )}
            {config.filterOptions?.includes('priceLevel') && availablePriceLevels.length > 0 && (
              <button
                type="button"
                className="category-screen-filter-bar-chip"
                aria-pressed={priceActive}
                onClick={() => setOpenFilterSheet('priceLevel')}
              >
                Price{selectedPriceLevels.size > 0 ? ` · ${selectedPriceLevels.size}` : ''}
              </button>
            )}
            {showDistanceFilter && (
              <button
                type="button"
                className="category-screen-filter-bar-chip"
                aria-pressed={distanceActive}
                onClick={() => setOpenFilterSheet('distance')}
              >
                Distance
              </button>
            )}
            {showOpenNowFilter && (
              <button
                type="button"
                className="category-screen-filter-bar-chip"
                aria-pressed={openNowActive}
                onClick={() => setOpenFilterSheet('openNow')}
              >
                Hours
              </button>
            )}
          </div>
          {config.filterOptions && hasFilterableData && activeFilterCount > 0 && (
            <button type="button" className="category-screen-filter-bar-clear" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* "Nearest" hint (2026-09-15) - shown right under the sort+filter
          pill row itself, not inside the FilterSheet below, since the pill
          row is always visible while a given sheet usually isn't open.
          Only rendered while "Nearest" is actually selected, and
          explains whichever state is stopping it from sorting yet - never
          silently shows Recommended order with the dropdown reading
          "Nearest" and no explanation, since that would look like a bug
          rather than the deliberate graceful-fallback behavior it is (see
          sortItems' doc comment above). Reuses the distance filter's own
          location-state classes/copy conventions (category-screen-location-
          button/-status, category-screen-filter-hint) rather than inventing
          a parallel set of styles for what's the same underlying states. */}
      {config.sortOptions && sortBy === 'nearest' && (
        <div className="category-screen-controls category-screen-sort-hint-row">
          {locationStatus === 'idle' && (
            <>
              <span className="category-screen-location-status">
                Showing Recommended order until we know where you are.
              </span>
              <button
                type="button"
                className="category-screen-location-button"
                onClick={requestLocation}
              >
                Use my location
              </button>
            </>
          )}
          {locationStatus === 'loading' && (
            <span className="category-screen-location-status">Finding your location…</span>
          )}
          {(locationStatus === 'denied' || locationStatus === 'unavailable') && (
            <span className="category-screen-location-status">
              Couldn&apos;t access your location — showing Recommended order.{' '}
              <button
                type="button"
                className="category-screen-filter-clear-inline"
                onClick={requestLocation}
              >
                Try again
              </button>
            </span>
          )}
          {locationStatus === 'granted' && !nearestUsable && (
            <span className="category-screen-location-status">
              You&apos;re a bit too far from {city?.name ?? 'this city'} for distance sorting —
              showing Recommended order instead.
            </span>
          )}
          {locationStatus === 'granted' && nearestUsable && (
            <span className="category-screen-location-status">
              {walkingDistancesStatus === 'ready'
                ? 'Sorted by real walking distance.'
                : walkingDistancesStatus === 'error'
                  ? "Couldn't get real walking distances — sorted by straight-line distance instead (the actual order may differ slightly)."
                  : 'Sorting by approximate distance while we get real walking distances…'}
            </span>
          )}
        </div>
      )}

      {/* Sort's own custom dropdown panel (2026-10-17) - see the
          sortMenuOpen/openSortMenu doc comment above the state
          declarations, and the pill-row comment above, for why this is a
          portal onto <body> with a JS-computed position rather than a
          normal nested absolutely-positioned div. Rendered conditionally
          on sortMenuPos too, not just sortMenuOpen, so there's never a
          frame where it's mounted at a stale/default position. */}
      {config.sortOptions &&
        sortMenuOpen &&
        sortMenuPos &&
        createPortal(
          <div
            ref={sortMenuRef}
            className="category-screen-sort-menu"
            role="listbox"
            aria-label="Sort by"
            style={{
              top: sortMenuPos.top,
              left: sortMenuPos.left,
              minWidth: sortMenuPos.minWidth,
            }}
          >
            {config.sortOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === sortBy}
                className="category-screen-sort-menu-option"
                onClick={() => chooseSortOption(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      {/* The focused per-dimension sheet itself (2026-10-02; sort split back
          out to its own custom dropdown panel 2026-10-17, no longer opens
          this sheet at all - see the pill-row comment above) - one FilterSheet
          instance whose title/content swap based on openFilterSheet,
          rather than a separate sheet per dimension, since only one filter
          dimension can ever be open at a time anyway. Gated on
          config.filterOptions alone now that sort doesn't use it; every
          current category with sortOptions also has filterOptions (Eating
          Out, Sightseeing), so this hasn't changed which categories render
          it, just made the gate honest about what it's actually for.
          Content below is the same chip markup the old stacked panel used
          (same category-screen-filter-chips/-chip classes), just shown one
          dimension at a time instead of all four stacked together - see
          FilterSheet.jsx for the sheet mechanics (slide-up, swipe-to-
          dismiss, backdrop tap, close button). */}
      {config.filterOptions && (
        <FilterSheet
          isOpen={openFilterSheet !== null}
          onClose={() => setOpenFilterSheet(null)}
          title={
            openFilterSheet === 'types'
              ? (config.typeFilterLabel ?? 'Type')
              : openFilterSheet === 'priceLevel'
                ? 'Price'
                : openFilterSheet === 'distance'
                  ? 'Distance'
                  : openFilterSheet === 'openNow'
                    ? 'Hours'
                    : ''
          }
          onClear={
            (openFilterSheet === 'types' && typesActive && clearTypesFilter) ||
            (openFilterSheet === 'priceLevel' && priceActive && clearPriceLevelsFilter) ||
            (openFilterSheet === 'distance' && distanceActive && clearDistanceFilter) ||
            (openFilterSheet === 'openNow' && openNowActive && clearOpenNowFilter) ||
            undefined
          }
        >
          {openFilterSheet === 'types' && (
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
          )}

          {openFilterSheet === 'priceLevel' && (
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
          )}

          {openFilterSheet === 'distance' && (
            <>
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
            </>
          )}

          {openFilterSheet === 'openNow' && (
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
          )}
        </FilterSheet>
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

      {/* Sectioned (Activities, see activityGroupSections above) vs flat
          (every other category) - each section's pill heading is now a
          collapse/expand toggle (2026-10-23, collapsedGroups above),
          independent per section. Expanded by default (nothing in
          collapsedGroups until a section is actually collapsed) so a
          fresh visit shows the full page exactly as the uncollapsible
          version did - collapsing is something you opt into per section,
          not a changed default. */}
      {sortedItems.length > 0 && activityGroupSections && (
        <div className="category-screen-list">
          {activityGroupSections.map((section) => {
            const isCollapsed = collapsedGroups.has(section.key);
            return (
              <div className="category-screen-group-section" key={section.key}>
                <h2 className="category-screen-group-section-heading-row">
                  <button
                    type="button"
                    className="category-screen-group-section-heading"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleGroupSection(section.key)}
                  >
                    {section.label}
                    <svg
                      className="category-screen-group-section-chevron"
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </h2>
                {!isCollapsed && (
                  <div className="category-screen-group-section-items">
                    {section.rows.map((row) => renderRow(row))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sortedItems.length > 0 && !activityGroupSections && (
        <div className="category-screen-list">{displayRows.map((row) => renderRow(row))}</div>
      )}
    </div>
  );
}

export default CategoryScreen;
