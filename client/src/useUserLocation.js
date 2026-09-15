import { useCallback, useEffect, useState } from 'react';

// Wraps the browser Geolocation API for the Eating Out distance filter
// (2026-08-28). Deliberately request-on-demand (requestLocation() is called
// from a "Use my location" button in CategoryScreen.jsx) rather than on
// mount, so the permission prompt only appears once the user actually
// opens the distance filter, not just from visiting the screen.
//
// Not tied to any one category on purpose - proximity isn't cuisine
// specific, so this is reusable if Activities/Sightseeing grow a distance
// filter later (see categoryConfig.js). Because CategoryScreen stays
// mounted across a category switch (only its route params change - see the
// loadedKey reset pattern in CategoryScreen.jsx), a granted location
// persists across categories in the same visit instead of re-prompting.
//
// autoFetchIfGranted (2026-09-15, default false/opt-in) - added after
// Blake found EntryWalkingTime.jsx's "Show walking time" button annoying to
// re-tap on every single entry: unlike CategoryScreen, EntryDetail.jsx
// mounts a fresh component (and so a fresh instance of this hook) per
// entry, so it never got the same free within-a-visit persistence
// CategoryScreen has. When true, this hook auto-calls requestLocation() on
// mount, but ONLY once the Permissions API confirms the browser has
// already granted this origin geolocation access - which it remembers
// itself, independent of this app's own React state and across page
// reloads, so calling getCurrentPosition() in that case returns a position
// silently with no dialog. That means this never reintroduces the
// auto-prompt this hook was deliberately built to avoid: a fresh 'prompt'
// (never asked) or 'denied' permission state is left alone and still waits
// for an explicit tap, exactly as before. Left false/opt-in rather than
// made the default everywhere specifically so CategoryScreen's distance
// filter keeps its current behavior unchanged - that filter's own
// walking-distances effect fires an OpenRouteService Matrix API call as
// soon as locationStatus is 'granted' regardless of whether the filter
// panel is even open (see CategoryScreen.jsx), so auto-granting there too
// would mean silently spending ORS quota on every Eating Out visit rather
// than only when someone actually opens the distance filter - a real
// behavior change that deserves its own decision, not a side effect of
// fixing the entry-detail annoyance. EntryWalkingTime.jsx has no such
// side effect (it only ever looks up the one entry it's already showing),
// so it opts in.
//
// status: 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'
export function useUserLocation({ autoFetchIfGranted = false } = {}) {
  const [status, setStatus] = useState('idle');
  const [coords, setCoords] = useState(null);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus('granted');
      },
      () => {
        setStatus('denied');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  // See the autoFetchIfGranted doc comment above. Wrapped defensively: the
  // Permissions API's 'geolocation' query name isn't universally supported
  // (some Safari versions in particular) - an unsupported/throwing query
  // just leaves this waiting for a tap, same as autoFetchIfGranted: false.
  useEffect(() => {
    if (!autoFetchIfGranted) return;
    if (!('permissions' in navigator) || !('geolocation' in navigator)) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (!cancelled && result.state === 'granted') requestLocation();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchIfGranted]);

  return { status, coords, requestLocation };
}
