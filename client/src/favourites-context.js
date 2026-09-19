import { createContext, useContext } from 'react';

// Plain (non-component) module: the context object plus the hook that reads
// it. Kept separate from FavouritesProvider.jsx so that file only exports a
// component (React Fast Refresh works reliably that way) - same split
// already used for city-context.js/CityProvider.jsx and auth-context.js/
// AuthProvider.jsx.
//
// Context value shape: { favouriteIds, loading, toggleFavourite, refresh }
//   - favouriteIds: a Set<number> of this device's favourited Entry ids -
//     just ids, not full entry objects, since every consumer of this
//     context other than the Favourites screen itself (FavouriteButton.jsx,
//     rendered on cards across every category/city) only ever needs a
//     yes/no answer for a given id. The Favourites screen fetches its own
//     copy of the full entries - see Favourites.jsx.
//   - loading: true until the initial GET /api/favourites fetch settles.
//   - toggleFavourite(entryId): add/remove a favourite, optimistically
//     updating favouriteIds immediately and reverting on a failed request.
//   - refresh(): re-fetches favouriteIds from the server - exposed mainly
//     so Favourites.jsx's own list can be re-synced after it removes a
//     favourite locally, without this context and that screen's list
//     drifting out of sync with each other.
export const FavouritesContext = createContext(null);

export function useFavourites() {
  const ctx = useContext(FavouritesContext);
  if (!ctx) throw new Error('useFavourites must be used within a FavouritesProvider');
  return ctx;
}
