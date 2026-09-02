import { useCallback, useEffect, useRef, useState } from 'react';
import { useCity } from './city-context.js';
import { CityDataContext } from './city-data-context.js';

// How long a cached city bundle is trusted before a background refresh is
// worth kicking off again for it - see the visibilitychange effect below.
// Not a hard expiry: cached data is always shown immediately regardless of
// age, this only decides whether to also quietly re-fetch behind it.
const REVALIDATE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

const STORAGE_PREFIX = 'travelfox:cityData:';

function readCachedBundle(cityId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + cityId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Storage can be unavailable (private browsing, disabled) - treat the
    // same as "nothing cached" rather than breaking the city.
    return null;
  }
}

function writeCachedBundle(cityId, bundle) {
  try {
    localStorage.setItem(STORAGE_PREFIX + cityId, JSON.stringify(bundle));
  } catch {
    // Storage can be full/unavailable - the in-memory cache still works
    // for this page session, it just won't survive a reload.
  }
}

// One batch of requests covering everything every screen for this city
// needs (Home's category icons, CategoryScreen's entries/activity-types,
// Neighbourhoods' pins) - see the doc comment on CityDataProvider below for
// why this replaces each screen fetching its own slice independently.
// `entries` deliberately omits the `?category=` filter GET
// /api/cities/:cityId/entries supports - screens that want one category's
// worth filter this client-side instead (see CategoryScreen.jsx), since the
// whole point here is one fetch per city, not one per category.
async function fetchCityBundle(cityId) {
  const base = import.meta.env.VITE_API_URL;
  const [entries, activityTypes, homeCategories, neighbourhoods] = await Promise.all([
    fetch(`${base}/api/cities/${cityId}/entries`).then((res) => res.json()),
    fetch(`${base}/api/cities/${cityId}/activity-types`).then((res) => res.json()),
    fetch(`${base}/api/cities/${cityId}/home-categories`).then((res) => res.json()),
    fetch(`${base}/api/cities/${cityId}/neighbourhoods`).then((res) => res.json()),
  ]);
  return {
    entries,
    activityTypes,
    homeCategorySlugs: homeCategories.map((c) => c.slug),
    neighbourhoods,
    fetchedAt: Date.now(),
  };
}

// Loads every screen's data for the current city ONCE and shares it through
// context, instead of Home/CategoryScreen/ActivityTypeDetail/EntryDetail/
// Neighbourhoods each independently re-fetching their own slice every time
// they're navigated to - which was the "why does tapping into a new
// category hit the database again" problem this was built to fix. Sits
// below CityProvider (needs `city` from it) and above AppRoutes - see
// App.jsx.
//
// Caching strategy, deliberately simple (2026-09-02):
//   - In-memory cache, keyed by city id, kept for the page's lifetime - so
//     switching between two cities repeatedly only fetches each one once
//     per session, and revisiting a category/entry you've already loaded
//     this session never touches the network at all.
//   - Hydrated from localStorage the first time a given city is selected
//     (if a bundle was saved last session), so there's something to show
//     immediately rather than a loading state while the network request is
//     in flight. This also happens to give the data a shape a later
//     offline mode can build on directly (swap localStorage for IndexedDB,
//     add a service-worker cache-first strategy over the same REST
//     endpoints) rather than needing a re-architecture - see the "offline
//     mode" note in claude/todo.md.
//   - A background refresh always runs the first time a city is selected
//     in a given page session (even if localStorage already had a bundle
//     for it), and again if the cached bundle is older than
//     REVALIDATE_AFTER_MS when the tab regains visibility - so a
//     long-lived session (or one resumed from the phone's app switcher)
//     doesn't serve indefinitely stale data, without every screen switch
//     re-hitting the server.
//   - A save in EntryEditor.jsx patches the cache directly via
//     upsertEntry() instead of waiting for/forcing a re-fetch, so your own
//     edits show up immediately.
//
// Deliberately NOT covered here: Search.jsx still queries
// GET /api/cities/:cityId/search directly. That endpoint does
// accent-folded matching server-side (see foldAccents in server/index.js);
// duplicating that logic client-side to search the cached bundle instead
// felt like a separate piece of work with its own risk of behaving subtly
// differently, not part of "stop re-fetching when I tap around the app".
export function CityDataProvider({ children }) {
  const { city } = useCity();
  const [bundles, setBundles] = useState({}); // { [cityId]: bundle }
  const [categories, setCategories] = useState(null);
  const fetchedThisSession = useRef(new Set());
  const inFlight = useRef(new Map()); // cityId -> Promise, de-dupes overlapping fetches

  // Never rejects - a failed fetch is logged and simply leaves the
  // relevant city's bundle as whatever it was before (null on a first
  // load, so the screens reading it just keep showing their loading
  // state; unchanged on a background revalidation, so a stale-but-present
  // bundle keeps being served rather than being replaced with nothing).
  // Matches how every other fetch in this app already handles failure -
  // console.error and stop, no retry/error UI yet - and avoids an
  // unhandled rejection at either call site below, neither of which
  // attaches a .catch of its own.
  const loadCity = useCallback((cityId) => {
    if (inFlight.current.has(cityId)) return inFlight.current.get(cityId);
    const promise = fetchCityBundle(cityId)
      .then((bundle) => {
        writeCachedBundle(cityId, bundle);
        setBundles((prev) => ({ ...prev, [cityId]: bundle }));
        fetchedThisSession.current.add(cityId);
        return bundle;
      })
      .catch((err) => {
        console.error(`Failed to fetch city data for city ${cityId}:`, err);
        return undefined;
      })
      .finally(() => {
        inFlight.current.delete(cityId);
      });
    inFlight.current.set(cityId, promise);
    return promise;
  }, []);

  const ensureCategories = useCallback(() => {
    if (categories !== null) return Promise.resolve(categories);
    return fetch(`${import.meta.env.VITE_API_URL}/api/categories`)
      .then((res) => res.json())
      .then((data) => {
        setCategories(data);
        return data;
      })
      .catch((err) => {
        console.error('Failed to fetch categories:', err);
        return [];
      });
  }, [categories]);

  useEffect(() => {
    if (!city) return;
    const cityId = city.id;

    setBundles((prev) => {
      if (prev[cityId]) return prev;
      // Nothing in memory yet for this city - hydrate from localStorage
      // immediately (if available) so it isn't a blank loading state while
      // the network request below is in flight.
      const cached = readCachedBundle(cityId);
      return cached ? { ...prev, [cityId]: cached } : prev;
    });

    if (!fetchedThisSession.current.has(cityId)) {
      loadCity(cityId);
    }
  }, [city, loadCity]);

  // Stale-while-revalidate on resume: if the tab was hidden (backgrounded,
  // switched away from) and comes back after the current city's bundle has
  // gone stale, quietly re-fetch it - covers a trip that spans days, or a
  // curator edit made elsewhere (e.g. Prisma Studio) while this tab sat
  // idle.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || !city) return;
      const bundle = bundles[city.id];
      if (bundle && Date.now() - bundle.fetchedAt > REVALIDATE_AFTER_MS) {
        loadCity(city.id);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [city, bundles, loadCity]);

  // Patches a just-created/just-edited Entry into the current city's cache
  // in place - both the flat `entries` array (what CategoryScreen.jsx/
  // EntryDetail.jsx read) and, when the entry belongs to an ActivityType,
  // that type's nested `entries` array (what ActivityTypeDetail.jsx reads -
  // see GET /api/cities/:cityId/activity-types, which embeds each type's
  // provider entries inline). `entry.activityTypeId` is a plain scalar
  // column on Entry (see schema.prisma) so it's present on the saved row
  // even though EntryEditor.jsx's save requests only `include: {
  // category: true }` - no extra fetch needed to know which type (if any)
  // an entry belongs to.
  const upsertEntry = useCallback(
    (entry) => {
      if (!city) return;
      setBundles((prev) => {
        const bundle = prev[city.id];
        if (!bundle) return prev;

        const entries = bundle.entries.some((e) => e.id === entry.id)
          ? bundle.entries.map((e) => (e.id === entry.id ? entry : e))
          : [...bundle.entries, entry];

        const activityTypeId = entry.activityTypeId ?? null;
        const activityTypes = bundle.activityTypes.map((type) => {
          const hadIt = type.entries.some((e) => e.id === entry.id);
          const belongsHere = activityTypeId === type.id;
          if (!hadIt && !belongsHere) return type;
          const nextEntries = belongsHere
            ? hadIt
              ? type.entries.map((e) => (e.id === entry.id ? entry : e))
              : [...type.entries, entry]
            : type.entries.filter((e) => e.id !== entry.id);
          return { ...type, entries: nextEntries };
        });

        const updated = { ...bundle, entries, activityTypes };
        writeCachedBundle(city.id, updated);
        return { ...prev, [city.id]: updated };
      });
    },
    [city]
  );

  const refreshCity = useCallback(() => {
    if (!city) return Promise.resolve();
    return loadCity(city.id);
  }, [city, loadCity]);

  const cityData = city ? (bundles[city.id] ?? null) : null;

  return (
    <CityDataContext.Provider
      value={{
        cityData,
        cityDataReady: cityData != null,
        categories,
        ensureCategories,
        upsertEntry,
        refreshCity,
      }}
    >
      {children}
    </CityDataContext.Provider>
  );
}
