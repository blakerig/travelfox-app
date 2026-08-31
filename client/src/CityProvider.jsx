import { useCallback, useEffect, useState } from 'react';
import { CityContext } from './city-context.js';

// localStorage key for a manually-picked city (CityPicker.jsx). Namespaced
// to avoid collisions with anything else the app might later store there.
const SELECTED_CITY_KEY = 'travelfox:selectedCityId';

function readSavedCityId() {
  try {
    const raw = localStorage.getItem(SELECTED_CITY_KEY);
    return raw ? Number(raw) : null;
  } catch {
    // Storage can be unavailable (private browsing, disabled) - treat the
    // same as "nothing saved" rather than breaking city selection.
    return null;
  }
}

function saveCityId(id) {
  try {
    localStorage.setItem(SELECTED_CITY_KEY, String(id));
  } catch {
    // Non-fatal - the pick still works for this session, it just won't
    // survive a reload.
  }
}

// Single source of truth for "current city" - fetched once here so any
// screen that needs it (Home, CategoryScreen, ...) shares the same value
// instead of each re-fetching and re-picking a city independently.
//
// City selection (2026-08-30): a manual pick made via CityPicker.jsx is
// persisted to localStorage and takes precedence on every subsequent load
// over the Barcelona/first-city fallback below - once someone has chosen a
// city (e.g. planning a trip in advance), the app should never silently
// bounce them back to something else. See "Still open / deferred" in
// claude/home-screen-spec.md for the fuller decision history; geolocation-
// based auto-detection of the user's *physical* city (as opposed to the
// "use my current location" shortcut inside the picker, which is an
// explicit on-demand action) is a separate, not-yet-built scenario.
export function CityProvider({ children }) {
  const [cities, setCities] = useState([]);
  const [city, setCityState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/cities`)
      .then((res) => res.json())
      .then((data) => {
        setCities(data);
        const savedId = readSavedCityId();
        const saved = savedId != null ? data.find((c) => c.id === savedId) : null;
        setCityState(saved ?? data.find((c) => c.name === 'Barcelona') ?? data[0] ?? null);
      })
      .catch((err) => console.error('Failed to fetch cities:', err))
      .finally(() => setLoading(false));
  }, []);

  const selectCity = useCallback((next) => {
    if (!next) return;
    setCityState(next);
    saveCityId(next.id);
  }, []);

  // Applies a server-returned City (e.g. from CityEditor.jsx's PATCH) to
  // local state, so an edit shows up immediately without a full re-fetch of
  // /api/cities. Updates the `cities` list (so CityPicker stays in sync
  // too) and, when the edited city is the current one, `city` itself.
  // Doesn't touch the saved-city-id in localStorage - editing a city's
  // photo isn't a city *selection*, see selectCity above for that.
  const updateCity = useCallback((updated) => {
    setCities((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setCityState((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  return (
    <CityContext.Provider value={{ city, cities, loading, selectCity, updateCity }}>
      {children}
    </CityContext.Provider>
  );
}
