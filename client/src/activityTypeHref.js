// Split out of CategoryScreen.jsx (2026-08-31, added for Search.jsx to
// reuse) into its own plain module rather than just adding `export` there
// - CategoryScreen.jsx is a component file, and mixing a component export
// with a plain-function export breaks React Fast Refresh (see the same
// reasoning in city-context.js, which splits the CityContext/useCity
// exports out of CityProvider.jsx for the same reason).

// Despite the name (kept from when Activities was the only groupedByType
// category - see groupedByType in categoryConfig.js), this is generic and
// shared by every such category: also used for ShopType by
// ShopTypeDetail.jsx and CategoryScreen.jsx's Shopping rendering
// (2026-09-15). Nothing below is ActivityType-specific - it only reads
// `.description`/`.entries`, both present on ShopType too (see
// schema.prisma).
//
// A type with no description and exactly one provider skips straight to
// that provider's EntryDetail, rather than showing an intermediate screen
// with just one card and nothing else worth reading first. A type *with* a
// description still goes to the type's own detail screen even when it only
// has one provider, so that description isn't silently skipped over - see
// ActivityTypeDetail.jsx/ShopTypeDetail.jsx, which also handle being
// reached directly (e.g. a bookmarked link) with zero or one provider
// without needing this check.
export function activityTypeHref(slug, activityType) {
  if (!activityType.description && activityType.entries?.length === 1) {
    return `/category/${slug}/entry/${activityType.entries[0].id}`;
  }
  return `/category/${slug}/type/${activityType.id}`;
}
