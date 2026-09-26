import { createContext, useContext } from 'react';

// Plain (non-component) module: the context object plus the hook that reads
// it - same split as city-context.js/CityProvider.jsx, for the same reason
// (React Fast Refresh works reliably when a file exports only a component).
//
// Context value shape:
//   { cityData, cityDataReady, categories, ensureCategories, upsertEntry,
//     activityGroups, ensureActivityGroups, upsertActivityType,
//     upsertShopType, refreshCity }
//
//   - cityData: the current city's cached bundle -
//     { entries, activityTypes, shopTypes, homeCategorySlugs,
//     homeCategoryIcons, neighbourhoods, fetchedAt } - or null until the
//     first fetch for this city has landed
//     (from the network or, on a repeat visit, hydrated from localStorage -
//     see CityDataProvider.jsx). `entries` is every Entry in the city (not
//     filtered by category - screens that only want one category's worth,
//     e.g. CategoryScreen.jsx, filter it client-side by `entry.category.slug`
//     rather than each firing their own `?category=` request). `shopTypes`
//     (2026-09-15) is Shopping's equivalent of `activityTypes` below - see
//     ShopType in schema.prisma. `homeCategoryIcons` (2026-09-26) is a
//     slug -> URL map of this city's own icon art, only present for a
//     category that has one - see CategoryIcon in schema.prisma - Home.jsx
//     falls back to its bundled default icon for any slug missing here.
//   - cityDataReady: true once cityData is non-null. Screens that used to
//     gate their loading state on "have I fetched yet" gate it on this
//     instead.
//   - categories: the full Category list ([{ id, slug, name }, ...]) -
//     reference data, not city-scoped, fetched once for the app's lifetime
//     the first time anything calls ensureCategories() (EntryEditor.jsx,
//     resolving a :slug to a categoryId for a new entry). null until then.
//   - ensureCategories(): returns a Promise of `categories`, fetching once
//     if it hasn't been already.
//   - upsertEntry(entry): patches a just-created/just-edited Entry into the
//     current city's cached bundle in place (see EntryEditor.jsx's
//     handleSave) so the app reflects your own edit immediately, without
//     waiting on or forcing a full re-fetch.
//   - activityGroups: every ActivityGroup that exists ([{ id, slug, name,
//     sortOrder }, ...]) - reference data, not city-scoped (same idea as
//     `categories` above), fetched once for the app's lifetime the first
//     time anything calls ensureActivityGroups() (ActivityTypeEditor.jsx,
//     populating its Group dropdown). null until then.
//   - ensureActivityGroups(): returns a Promise of `activityGroups`,
//     fetching once if it hasn't been already.
//   - upsertActivityType(activityType): patches a just-created/just-edited
//     ActivityType into the current city's cached bundle in place (see
//     ActivityTypeEditor.jsx's handleSave), same idea as upsertEntry above
//     but simpler - an ActivityType save can't change which Entries exist,
//     so only `bundle.activityTypes` needs touching, not `entries` too.
//   - upsertShopType(shopType): same as upsertActivityType above, for
//     ShopType (2026-09-15, see ShopTypeEditor.jsx's handleSave) - patches
//     `bundle.shopTypes` only.
//   - refreshCity(): forces a fresh network fetch of the current city's
//     bundle. Not wired to any UI yet - available for a future
//     pull-to-refresh.
export const CityDataContext = createContext(null);

export function useCityData() {
  const ctx = useContext(CityDataContext);
  if (!ctx) throw new Error('useCityData must be used within a CityDataProvider');
  return ctx;
}
