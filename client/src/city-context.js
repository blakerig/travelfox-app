import { createContext, useContext } from 'react';

// Plain (non-component) module: the context object plus the hook that reads
// it. Kept separate from CityProvider.jsx so that file only exports a
// component (React Fast Refresh works reliably that way).
//
// Context value shape: { city, cities, loading, selectCity, updateCity }
//   - city: the currently-selected City (with nested `country`), or null
//     while loading/unset.
//   - cities: the full list of cities the app covers (same fetch backs
//     both the current-city lookup and the CityPicker's list, so it's
//     surfaced here rather than re-fetched).
//   - loading: true until the initial /api/cities fetch settles.
//   - selectCity(city): manually switch the current city. Persists the
//     choice (see CityProvider.jsx) so it survives a reload and isn't
//     overwritten by anything automatic - see the "shouldn't get bounced
//     back" decision in claude/home-screen-spec.md.
//   - updateCity(city): apply a server-returned City (e.g. after
//     CityEditor.jsx saves a new photoUrl) to local state - not a
//     selection, just keeps `city`/`cities` current after an edit.
export const CityContext = createContext(null);

export function useCity() {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error('useCity must be used within a CityProvider');
  return ctx;
}
