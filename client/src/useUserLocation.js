import { useCallback, useEffect, useRef, useState } from 'react';

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
// highAccuracy / maxCacheAgeMs / refreshOnVisible (2026-10-14) - added
// after Blake reported a walking-time figure reading "10 min" while he was
// already standing inside the restaurant. Root cause traced to three
// compounding defaults in this hook, none of which needed to be this loose
// for a feature whose whole point is "how close am I right now":
//
//   1. enableHighAccuracy was hardcoded false, letting the browser answer
//      from coarse WiFi/cell-tower positioning instead of GPS - commonly
//      off by hundreds of metres in a dense city, which alone can turn
//      "0 min" into "10 min."
//   2. maximumAge was hardcoded to 5 minutes, so even a fresh
//      requestLocation() call could hand back a position computed up to
//      5 minutes earlier - stale by exactly the amount of walking that
//      happened in between.
//   3. getCurrentPosition() only ever fires once per explicit call -
//      there was (and still is) no continuous watchPosition() stream, so a
//      screen that's already open when you arrive never re-checks on its
//      own. Combined with (1) and (2), opening an entry a few minutes out
//      and then walking there with the same screen still open meant the
//      number never had a reason to update.
//
// Fixes (1) and (2) directly via two new opt-in options, defaulted to the
// exact previous values so CityPicker.jsx's "which city am I near" check
// (accuracy to the metre doesn't matter within a 50km match radius) and
// EntryLocationMap.jsx (currently unused/disabled - see claude/todo.md)
// are completely unaffected unless they're deliberately updated too.
// EntryWalkingTime.jsx and CategoryScreen.jsx's distance filter both now
// opt into highAccuracy: true and a much shorter maxCacheAgeMs, since
// those are exactly the two features where "how far away, right now"
// needs to be as true as the device can make it.
//
// refreshOnVisible (also opt-in, false by default) addresses (3) without
// resorting to watchPosition()'s continuous battery/GPS drain: when true,
// it re-calls requestLocation() whenever the page/tab regains visibility
// (document.visibilitychange firing 'visible') and a position has already
// been granted once - the exact moment someone glances back at a screen
// they'd left open, e.g. after actually arriving and looking at their
// phone again, or switching back from a maps app. It deliberately does
// NOT fire for a never-asked/denied status - that still only ever resolves
// via an explicit tap or autoFetchIfGranted, same as always, so this never
// reintroduces the permission prompt on its own. A MIN_REFRESH_GAP_MS
// guard skips a refresh if the last fetch was only moments ago, in case
// visibilitychange fires in a quick flicker (briefly switching apps and
// right back) rather than a real "time actually passed" gap.
const MIN_REFRESH_GAP_MS = 15 * 1000;

// status: 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'
export function useUserLocation({
  autoFetchIfGranted = false,
  highAccuracy = false,
  maxCacheAgeMs = 5 * 60 * 1000,
  refreshOnVisible = false,
} = {}) {
  const [status, setStatus] = useState('idle');
  const [coords, setCoords] = useState(null);
  const lastFetchedAtRef = useRef(0);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('loading');
    lastFetchedAtRef.current = Date.now();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus('granted');
      },
      () => {
        setStatus('denied');
      },
      // A high-accuracy fix (real GPS, not network positioning) can
      // legitimately take longer to resolve, especially with a weak
      // signal - give it a longer timeout than the coarse default rather
      // than risk failing fast on exactly the requests we most want to
      // succeed.
      { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 15000 : 10000, maximumAge: maxCacheAgeMs }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highAccuracy, maxCacheAgeMs]);

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

  // See the refreshOnVisible doc comment above.
  useEffect(() => {
    if (!refreshOnVisible) return;
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (status !== 'granted') return;
      if (Date.now() - lastFetchedAtRef.current < MIN_REFRESH_GAP_MS) return;
      requestLocation();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshOnVisible, status, requestLocation]);

  return { status, coords, requestLocation };
}
