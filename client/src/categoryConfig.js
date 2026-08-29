// Per-category configuration for the category detail screen
// (CategoryScreen.jsx), keyed by Category.slug. Add an entry here when a
// category needs behaviour beyond the shared defaults - a sort control, a
// filter control. This is what keeps CategoryScreen a single generic
// component instead of five near-duplicate screens.
//
// cardVariant picks which EntryCard layout to use:
//   'venue'     - has a location/rating/price (Activities)
//   'photo'     - photo + name + price/type line + summary, no
//                 rating/address on the card itself (Eating Out,
//                 Sightseeing - rating/address still show on the
//                 entry-detail screen, see EntryDetail.jsx). Renamed from
//                 'restaurant' (2026-08-28) once Sightseeing started using
//                 the same layout - the variant describes the card's
//                 shape, not one specific category.
//   'reference' - descriptive content only, no location (Essentials)
//
// cardShowPrice (2026-08-28, 'photo' variant only) - whether the meta line
// includes priceLevel. true for Eating Out; false for Sightseeing, which
// doesn't have a restaurant-style $/$$/$$$ tier, so its card just shows the
// type instead. Defaults to true when omitted; ignored by other variants.
//
// filterOptions lists which Entry fields CategoryScreen should offer as
// filter chips (2026-08-28) - null/omitted means no filter control at all.
// 'priceLevel' is Eating Out only - raised once the user pointed out a
// single city could have 60-80 restaurants, where filtering matters more
// than sort order (see CategoryScreen.jsx); Sightseeing entries don't
// carry a comparable price tier (see cardShowPrice below), so it isn't
// offered as a filter there either. 'type' is shared by both Eating Out
// and Sightseeing (added there 2026-08-28) - it was `cuisine` until
// Entry.cuisine was generalised to Entry.type so Sightseeing could reuse
// the same field for its own place type (Museum, Building, ...) instead
// of carrying a separate, differently-named column - see schema.prisma.
// Available filter *values* within each dimension are derived from
// whatever's actually present in the fetched entries, not hardcoded here -
// so a filter chip never appears for a type/price level nothing currently
// uses.
//
// typeFilterLabel (2026-08-28) names the 'type' filter's group/chip-panel
// heading for a category - e.g. "Cuisine" for Eating Out - since the
// underlying Entry.type field is generic but the word a user expects to
// see there still differs by category. Falls back to "Type" when unset.
//
// 'distance' (added 2026-08-28) filters by straight-line distance from the
// user's current location (see geo.js/useUserLocation.js) - unlike
// type/priceLevel it isn't Eating-Out-specific in principle (any venue
// with coordinates could use it), it's just only wired up here for now.
// Deliberately a filter only, not a sort option: the user has direct
// experience of a straight-line "Nearest" sort being misleading in a dense
// city (a closer-as-the-crow-flies restaurant can be a longer walk than a
// farther one), so ranking by this distance was judged too likely to
// mislead. A radius cutoff is a coarser, more defensible use of the same
// number - it's honest about being approximate rather than claiming to
// know which option is truly closest. Real walking distance/time (via a
// routing API) is logged in claude/todo.md - that's what a "Nearest" sort
// should wait for.
//
// Food & Drink is deliberately left out for now, same as in Home.jsx's
// CATEGORY_DISPLAY and the server seed - no icon asset exists yet. Add it
// here too once it's added in those other two places.
//
// itemLabel/itemLabelPlural (2026-08-28) name a single entry in this
// category, e.g. "restaurant"/"restaurants" - used by CategoryScreen.jsx to
// show a count above the list ("42 restaurants", or "12 of 42 restaurants"
// once filtered). Falls back to the generic "entry"/"entries" in
// DEFAULT_CATEGORY_CONFIG for any category that doesn't set its own.

const SORT_NAME_RATING = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'rating', label: 'Rating' },
];

// Eating Out only (2026-08-28): 'curated' isn't a real sort - CategoryScreen's
// sortEntries() doesn't recognise it, so entries pass through unchanged in
// whatever order the server returned them, i.e. Entry.sortOrder (see
// GET /api/cities/:cityId/entries). Listed first so it's the *default* on
// first load - deliberately not name/rating: with 60-80 restaurants per
// city expected, A-Z would arbitrarily favour names starting with "A", and
// a displayed star rating implies a review system that doesn't exist.
// "Recommended" here just means "the order the curator hand-picked in
// Prisma Studio" - same sortOrder mechanism Essentials already uses. "Name
// (A-Z)" stays available for someone scanning for a specific known name.
const SORT_CURATED_NAME = [
  { value: 'curated', label: 'Recommended' },
  { value: 'name', label: 'Name (A-Z)' },
];

export const CATEGORY_CONFIG = {
  essentials: {
    title: 'Essentials',
    cardVariant: 'reference',
    sortOptions: null,
    filterOptions: null,
    itemLabel: 'entry',
    itemLabelPlural: 'entries',
  },
  // Grouped by ActivityType rather than showing Entry cards directly
  // (2026-08-28) - see ActivityType in schema.prisma. Unlike the other
  // categories, where each Entry is a unique, non-substitutable thing, an
  // activity (Laser Tag, Padel, ...) is often offered by several roughly
  // interchangeable providers, so CategoryScreen shows ActivityType cards
  // here (cardVariant: 'group') and drills into ActivityTypeDetail.jsx for
  // the provider list within one type - see groupedByType in
  // CategoryScreen.jsx. No sort/filter options yet - types are hand-ordered
  // via ActivityType.sortOrder (same mechanism as Entry.sortOrder
  // elsewhere), and rating/price/type don't apply at the type level the way
  // they do to a flat Entry list.
  activities: {
    title: 'Activities',
    groupedByType: true,
    cardVariant: 'group',
    // Card layout for provider mini-cards on ActivityTypeDetail - 'venue'
    // since a provider is a located, unique thing (rating/price/address),
    // same as any other Activities entry used to be before grouping.
    providerCardVariant: 'venue',
    sortOptions: null,
    filterOptions: null,
    itemLabel: 'activity',
    itemLabelPlural: 'activities',
  },
  'eating-out': {
    title: 'Eating Out',
    cardVariant: 'photo',
    cardShowPrice: true,
    sortOptions: SORT_CURATED_NAME,
    filterOptions: ['type', 'priceLevel', 'distance'],
    typeFilterLabel: 'Cuisine',
    itemLabel: 'restaurant',
    itemLabelPlural: 'restaurants',
  },
  sightseeing: {
    title: 'Sightseeing',
    cardVariant: 'photo',
    cardShowPrice: false,
    sortOptions: SORT_NAME_RATING,
    // Type and distance, but not price (2026-08-28) - sightseeing entries
    // don't have a restaurant-style price tier worth filtering on, see
    // cardShowPrice above.
    filterOptions: ['type', 'distance'],
    itemLabel: 'place',
    itemLabelPlural: 'places',
  },
};

const DEFAULT_CATEGORY_CONFIG = {
  cardVariant: 'venue',
  cardShowPrice: true,
  sortOptions: null,
  filterOptions: null,
  itemLabel: 'entry',
  itemLabelPlural: 'entries',
};

// Safety net for a slug with no config entry yet (e.g. a category added to
// the DB before its UI config was written) - renders with sane defaults
// rather than crashing.
export function getCategoryConfig(slug) {
  return CATEGORY_CONFIG[slug] ?? { ...DEFAULT_CATEGORY_CONFIG, title: slug };
}
