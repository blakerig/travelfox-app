import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FavouritesContext } from './favourites-context.js';
import { getDeviceId } from './deviceId.js';

// Tracks which entries this device has favourited, shared across the whole
// app - a star toggle on an Eating Out card in Barcelona should read the
// same favourited state if that same entry ever shows up again in, say, a
// search result, without each card fetching its own copy. See "Favourites"
// in claude/home-screen-spec.md/todo.md for the feature's product
// background (anonymous device-scoped bookmarking, deferred consumer
// accounts).
//
// Sits alongside AuthProvider/CityProvider in App.jsx, but is deliberately
// independent of both: favouriting has nothing to do with team-account
// login (auth-context.js is for staff editing content, not a consumer
// account), and a favourite isn't scoped to the currently-selected city
// the way CityDataProvider's cache is - a device's favourites span every
// city it's ever browsed, which is exactly why GET /api/favourites doesn't
// take a cityId.
export function FavouritesProvider({ children }) {
  const [favouriteIds, setFavouriteIds] = useState(() => new Set());
  // Mirrors favouriteIds, updated synchronously in the render body (not an
  // effect) so it's always current the instant an event handler runs - see
  // toggleFavourite below for why this exists instead of just reading
  // favouriteIds directly.
  const favouriteIdsRef = useRef(favouriteIds);
  favouriteIdsRef.current = favouriteIds;
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const deviceId = getDeviceId();
    return fetch(`${import.meta.env.VITE_API_URL}/api/favourites?deviceId=${encodeURIComponent(deviceId)}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((entries) => setFavouriteIds(new Set(entries.map((e) => e.id))))
      .catch((err) => console.error('Failed to load favourites:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Optimistic: flips the local Set immediately so the star responds
  // instantly rather than waiting on a round trip, then confirms with the
  // server in the background and reverts if that fails - never leaves the
  // UI claiming a favourite saved (or was removed) when it actually
  // wasn't, same "don't show more certainty than you have" principle used
  // throughout this app (e.g. the walking-distance estimate labeling).
  //
  // wasFavourited is read from favouriteIdsRef, not React state directly
  // (2026-09-19 fix, second attempt - the first attempt tried reading it
  // from inside the setFavouriteIds updater and using it on the very next
  // line, which doesn't actually work: React doesn't run a state updater
  // synchronously before the following line executes, so that value was
  // effectively always undefined - every tap was misjudged as "not
  // currently favourited" and the app kept trying to add rather than
  // correctly detecting an existing favourite, which is what Blake hit
  // right after the previous fix). A ref that's reassigned to the latest
  // favouriteIds during every render, and updated again here before
  // setFavouriteIds is even called, is always accurate the instant a
  // click handler runs - no dependency on React's update timing at all.
  const toggleFavourite = useCallback((entryId) => {
    const deviceId = getDeviceId();
    const wasFavourited = favouriteIdsRef.current.has(entryId);

    const next = new Set(favouriteIdsRef.current);
    if (wasFavourited) next.delete(entryId);
    else next.add(entryId);
    favouriteIdsRef.current = next;
    setFavouriteIds(next);

    const request = wasFavourited
      ? fetch(
          `${import.meta.env.VITE_API_URL}/api/favourites/${entryId}?deviceId=${encodeURIComponent(deviceId)}`,
          { method: 'DELETE' }
        )
      : fetch(`${import.meta.env.VITE_API_URL}/api/favourites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, entryId }),
        });

    request
      .then((res) => {
        if (!res.ok) throw new Error(`Favourite request failed (${res.status})`);
      })
      .catch((err) => {
        console.error('Failed to update favourite:', err);
        // Revert the optimistic flip, same way - through the ref, so a
        // failure here can't clash with a different toggle that happened
        // on another entry in the meantime.
        const reverted = new Set(favouriteIdsRef.current);
        if (wasFavourited) reverted.add(entryId);
        else reverted.delete(entryId);
        favouriteIdsRef.current = reverted;
        setFavouriteIds(reverted);
      });
  }, []);

  const value = useMemo(
    () => ({ favouriteIds, loading, toggleFavourite, refresh }),
    [favouriteIds, loading, toggleFavourite, refresh]
  );

  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
}
