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
// cardShowPhone (2026-09-02, 'photo' variant only) - whether the meta line
// also includes a tap-to-call Entry.phone chip. Defaults to false when
// omitted (unlike cardShowPrice, which defaults to true) since most
// categories have no phone data at all yet - only Eating Out opts in.
// See EntryCard.jsx for the tel: link/stopPropagation handling.
//
// cardShowOpenStatus (2026-09-02, 'photo' variant only) - whether the card
// shows an "Open now"/"Closed" badge, computed from Entry.openingTimes and
// the entry's City.timezone (see openingHours.js's isOpenNow). Defaults to
// false when omitted, same reasoning as cardShowPhone: only Eating Out has
// opening-hours data worth showing a status for right now. The badge is
// hidden entirely (not shown as "unknown") when isOpenNow returns null -
// e.g. no opening-hours text yet, or the city has no timezone backfilled -
// rather than guessing, same principle as the distance filter.
//
// filterOptions lists which Entry fields CategoryScreen should offer as
// filter chips (2026-08-28) - null/omitted means no filter control at all.
// 'priceLevel' is Eating Out only - raised once the user pointed out a
// single city could have 60-80 restaurants, where filtering matters more
// than sort order (see CategoryScreen.jsx); Sightseeing entries don't
// carry a comparable price tier (see cardShowPrice below), so it isn't
// offered as a filter there either. 'types' is shared by both Eating Out
// and Sightseeing (added there 2026-08-28) - it was `cuisine` until
// Entry.cuisine was generalised to Entry.type so Sightseeing could reuse
// the same field for its own place type (Museum, Building, ...) instead
// of carrying a separate, differently-named column - see schema.prisma.
// `Entry.type` itself became `Entry.types String[]` (2026-08-30, see
// schema.prisma) so one entry can carry more than one value (a pinchos-and-
// Catalan restaurant, a Japanese/Mexican fusion place) - filterOptions'
// dimension key was renamed from 'type' to 'types' to match. Available
// filter *values* within each dimension are derived from whatever's
// actually present in the fetched entries, not hardcoded here - so a
// filter chip never appears for a type/price level nothing currently uses.
//
// 'openNow' (2026-09-02, Eating Out only) - a single on/off filter chip
// that keeps only entries isOpenNow() currently reports as true (an entry
// with no parseable opening hours, or whose city has no timezone set, is
// excluded while the filter is on rather than included by default - see
// CategoryScreen.jsx's hasOpenNowData/filterItems). Distinct from
// cardShowOpenStatus above: a category could in principle show the badge
// without offering the filter, or vice versa, though Eating Out enables
// both together for now.
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
// Deliberately a filter only, never a sort: the user has direct experience
// of a straight-line "Nearest" sort being misleading in a dense city (a
// closer-as-the-crow-flies restaurant can be a longer walk than a farther
// one), so ranking by this number specifically was judged too likely to
// mislead. A radius cutoff is a coarser, more defensible use of the same
// number - it's honest about being approximate rather than claiming to know
// which option is truly closest. This reasoning is about straight-line
// distance specifically, not distance sorting in general - see 'nearest' in
// SORT_NEAREST_CURATED_NAME below, added 2026-09-15 once real walking
// distance/duration existed to back a sort with (the thing this comment
// used to say a "Nearest" sort should wait for).
//
// expandInPlace (2026-08-29) - when true, CategoryScreen renders this
// category's cards without wrapping them in a Link to EntryDetail; instead
// EntryCard handles its own expand/collapse (tapping the photo or text
// toggles between the short snippet and the full description, in place,
// right there in the list) - see EntryCard.jsx's `expandable` prop and
// CategoryScreen.jsx's rendering branch. Local Cuisine is the only category
// using this so far: unlike Eating Out/Sightseeing, a dish or drink doesn't
// need its own full screen (no address/rating/hours to show), so a
// separate detail screen would just be an extra tap for no benefit.
// EntryDetail.jsx still works for this category if reached directly (e.g.
// right after saving in the editor) - this flag only changes how
// CategoryScreen links into cards, not whether the detail route exists.
//
// 'activityGroup' (2026-09-10, Activities only) - see the doc comment on
// the `activities` entry below for the fuller reasoning (single-select,
// rendered as an always-visible chip row rather than the collapsible
// filter panel). Its available chip values are still derived from what's
// actually fetched, same principle as 'types'/'priceLevel' above - a group
// with zero ActivityTypes in this city currently doesn't get a chip.
//
// itemLabel/itemLabelPlural (2026-08-28) name a single entry in this
// category, e.g. "restaurant"/"restaurants" - used by CategoryScreen.jsx to
// show a count above the list ("42 restaurants", or "12 of 42 restaurants"
// once filtered). Falls back to the generic "entry"/"entries" in
// DEFAULT_CATEGORY_CONFIG for any category that doesn't set its own.
//
// groupedTypeKey/typeApiPath/typeIdParam (2026-09-15, groupedByType
// categories only - Activities and, since then, Shopping) say which piece
// of the shared per-city cache and API a grouped category's "type" rows
// live at, since CategoryScreen.jsx/ActivityTypeDetail.jsx/
// ShopTypeDetail.jsx now serve more than one such category rather than
// Activities alone:
//   groupedTypeKey - the field on the cached city bundle holding this
//     category's type rows (see CityDataProvider.jsx) - 'activityTypes' or
//     'shopTypes'. Falls back to 'activityTypes' when unset, so this was
//     added without needing to touch the `activities` entry at the same
//     time - added there anyway for symmetry/clarity now that a second
//     value exists.
//   typeApiPath - the REST path segment for this category's type endpoints,
//     e.g. GET /api/cities/:cityId/<typeApiPath> - 'activity-types' or
//     'shop-types'.
//   typeIdParam - the query-param name EntryEditor.jsx reads/sends to link
//     a new provider Entry back to its type (see "+ Add provider" on
//     ActivityTypeDetail.jsx/ShopTypeDetail.jsx) - 'activityTypeId' or
//     'shopTypeId', matching the scalar column name on Entry itself (see
//     schema.prisma).

// Eating Out / Sightseeing sort options (2026-09-15: Sightseeing switched
// onto this same shared array, replacing its old name/rating-only one - see
// below). 'rating' was dropped outright, not just from Sightseeing: nothing
// in the app actually collects star ratings from real reviewers, so a
// "Rating" sort was ordering by a number that doesn't mean anything to a
// real user - same "don't claim precision you don't have" principle used
// throughout this app, just applied to a sort option rather than a
// displayed figure this time.
//
// 'nearest' (2026-09-15) is backed by real walking *duration* - the same
// OpenRouteService Matrix data already fetched for the distance filter and
// the card-level walking time (see walkingMinutesFor and the
// walkingDistances effect in CategoryScreen.jsx, and "Real walking
// distance/time" in claude/todo.md) - so this is the real-distance "Nearest"
// sort that was deliberately deferred back when only straight-line distance
// existed (see the 'distance' doc comment above). Listed first/default, but
// CategoryScreen.jsx's sortItems() only actually orders by it once the
// user's location is granted *and* judged close enough to this city -
// specifically not, per Blake's own example, someone planning a trip from
// elsewhere. Short of that (no permission yet, still resolving, or too far
// away) it gracefully falls through to the exact same pass-through order as
// 'curated' below, with a small hint explaining why, rather than sorting by
// a meaningless distance or leaving the list looking broken. Doesn't cost
// anything extra to compute - it reads data that's already being fetched for
// every category that offers this option, not a new request.
//
// 'curated' isn't a real sort - CategoryScreen's sortItems() doesn't
// recognise it, so entries pass through unchanged in whatever order the
// server returned them, i.e. Entry.sortOrder (see GET
// /api/cities/:cityId/entries) - "Recommended" just means "the order the
// curator hand-picked in Prisma Studio," same sortOrder mechanism Essentials
// already uses. Deliberately kept as an available option alongside 'nearest'
// rather than removed (Blake, 2026-09-15: "at least for now, keep it") for
// two reasons: it's the graceful fallback described above for whenever
// Nearest can't be computed, and it doubles as a manual override - switching
// to Recommended is how Blake can force a particular entry higher (via its
// sortOrder in Prisma Studio) even though it's farther away than others,
// without needing a separate "pin above the sorted list" mechanism built
// just for that.
//
// "Name (A-Z)" stays available for someone scanning for a specific known
// name, same as before.
const SORT_NEAREST_CURATED_NAME = [
  { value: 'nearest', label: 'Nearest' },
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
  // CategoryScreen.jsx. Still no sort options - types are hand-ordered via
  // ActivityType.sortOrder (same mechanism as Entry.sortOrder elsewhere),
  // and rating/price/type don't apply at the type level the way they do to
  // a flat Entry list.
  //
  // filterOptions: ['activityGroup'] (2026-09-10, see ActivityGroup in
  // schema.prisma) is the one filter dimension Activities does offer - a
  // broader interest grouping (Sport & Active, Culture & Arts, Outdoors &
  // Nature, Fun & Entertainment) an ActivityType can optionally belong to.
  // Deliberately NOT rendered through the same collapsible "Filters" panel
  // the other categories use (see CategoryScreen.jsx's showActivityGroupFilter
  // rendering branch) - with only this one dimension, and given how
  // fundamentally different an ActivityType card list is from a flat Entry
  // list already, an always-visible chip row directly under the header
  // reads better than a button that reveals a single row of chips. Single-
  // select (a plain string or null, not a Set like the 'types'/'priceLevel'
  // dimensions below) - "show me Sport & Active" is a single choice, not a
  // combinable set of tags the way cuisines are.
  activities: {
    title: 'Activities',
    groupedByType: true,
    groupedTypeKey: 'activityTypes',
    typeApiPath: 'activity-types',
    typeIdParam: 'activityTypeId',
    cardVariant: 'group',
    // Card layout for provider mini-cards on ActivityTypeDetail - 'venue'
    // since a provider is a located, unique thing (rating/price/address),
    // same as any other Activities entry used to be before grouping.
    providerCardVariant: 'venue',
    sortOptions: null,
    filterOptions: ['activityGroup'],
    itemLabel: 'activity',
    itemLabelPlural: 'activities',
  },
  // Grouped by ShopType, same mechanism as Activities above (see ShopType in
  // schema.prisma) - a shop "type" (Local Markets, Souvenirs, ...) is often
  // offered by several roughly interchangeable providers, so CategoryScreen
  // shows ShopType cards here and drills into ShopTypeDetail.jsx for the
  // provider list within one type.
  //
  // Deliberately no filterOptions/'shopGroup' dimension - unlike Activities,
  // Shopping has no ActivityGroup-style broader-interest grouping to filter
  // by (see the "no ActivityGroup equivalent" doc comment on ShopType in
  // schema.prisma for the reasoning) - revisit if that changes.
  shopping: {
    title: 'Shopping',
    groupedByType: true,
    groupedTypeKey: 'shopTypes',
    typeApiPath: 'shop-types',
    typeIdParam: 'shopTypeId',
    cardVariant: 'group',
    // Same reasoning as Activities' providerCardVariant above - a shop is a
    // located, unique thing.
    providerCardVariant: 'venue',
    sortOptions: null,
    filterOptions: null,
    itemLabel: 'shop',
    itemLabelPlural: 'shops',
  },
  'eating-out': {
    title: 'Eating Out',
    cardVariant: 'photo',
    cardShowPrice: true,
    // Shows Entry.phone on the front card's meta line, tap-to-call
    // (2026-09-02) - see cardShowPrice above for the same on/off-per-
    // category pattern. Eating Out only for now (the field itself is
    // generic on Entry - see schema.prisma - but phone/website/opening
    // hours are only actually being entered for restaurants so far).
    // Website and opening times aren't shown on the card at all, only on
    // the entry-detail screen (EntryDetail.jsx) - the card's meta line is
    // meant to stay a compact single line, not grow into a full contact
    // block.
    cardShowPhone: true,
    // See cardShowOpenStatus doc comment above.
    cardShowOpenStatus: true,
    sortOptions: SORT_NEAREST_CURATED_NAME,
    filterOptions: ['types', 'priceLevel', 'distance', 'openNow'],
    typeFilterLabel: 'Cuisine',
    itemLabel: 'restaurant',
    itemLabelPlural: 'restaurants',
  },
  sightseeing: {
    title: 'Sightseeing',
    cardVariant: 'photo',
    cardShowPrice: false,
    sortOptions: SORT_NEAREST_CURATED_NAME,
    // Type and distance, but not price (2026-08-28) - sightseeing entries
    // don't have a restaurant-style price tier worth filtering on, see
    // cardShowPrice above.
    filterOptions: ['types', 'distance'],
    itemLabel: 'place',
    itemLabelPlural: 'places',
  },
  'local-cuisine': {
    title: 'Local Cuisine',
    cardVariant: 'photo',
    cardShowPrice: false,
    // See the expandInPlace doc comment above.
    expandInPlace: true,
    sortOptions: null,
    filterOptions: null,
    itemLabel: 'dish',
    itemLabelPlural: 'dishes',
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
