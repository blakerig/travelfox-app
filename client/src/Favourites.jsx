import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Favourites.css';
import { useFavourites } from './favourites-context.js';
import { getDeviceId } from './deviceId.js';
import { CATEGORY_CONFIG, getCategoryConfig } from './categoryConfig.js';
import EntryCard from './EntryCard.jsx';
import BottomNav from './BottomNav.jsx';

// Same variant-selection rule Search.jsx already uses for a mixed list of
// entries spanning categories: Activities/Shopping providers use the
// 'venue' provider-card layout (config.providerCardVariant) rather than
// the 'group' layout their own category screens use for ActivityType/
// ShopType cards - there's nothing to group by here, every favourite is a
// single real Entry, never an ActivityType/ShopType row (see the
// "Favourites is Entry cards only" scope decision).
function variantFor(entry) {
  const config = getCategoryConfig(entry.category.slug);
  return entry.category.slug === 'activities' || entry.category.slug === 'shopping'
    ? config.providerCardVariant
    : config.cardVariant;
}

// A device's saved/bookmarked entries, reached via the bottom nav (see
// BottomNav.jsx) rather than nested inside any one city - favourites span
// every city a device has ever browsed, same reasoning GET /api/favourites
// isn't scoped to a cityId. Grouped by city (in whichever order each
// city's most-recently-favourited entry first appears in the server's
// createdAt-desc list) rather than shown as one flat list, since an entry
// only makes sense in the context of which city it's actually in - a
// favourited restaurant card alone doesn't say "Barcelona" or "Lyon"
// anywhere on it the way it implicitly does on a city's own category
// screen.
//
// Within each city, entries are further grouped by category (Eating Out,
// Sightseeing, Activities, ...) under a small pill label (2026-10-23, Blake's
// request) so a longer list reads as "your restaurants", "your activities"
// rather than one undifferentiated stack of cards. Pills follow
// CATEGORY_CONFIG's key order (stable, so a group doesn't jump around as
// favourites are added/removed); a category with no config entry yet sorts
// last. Only categories that actually have a favourite in that city get a
// pill - no empty headings.
function Favourites() {
  // favouriteIds (the shared context Set - see FavouritesProvider.jsx) is
  // what this screen actually renders against, not just `entries` below -
  // un-favouriting a card here (or anywhere else in the app, if this
  // screen happens to still be mounted) flips that Set instantly, and
  // filtering against it live is what makes the card disappear right away
  // without this screen needing its own separate removal wiring. `entries`
  // itself is only ever fetched once, on mount - a newly favourited entry
  // added from elsewhere won't appear here until this screen is reopened,
  // same fetch-on-mount pattern every other screen in this app already
  // uses (CategoryScreen, Search, ...).
  const { favouriteIds } = useFavourites();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const deviceId = getDeviceId();
    fetch(`${import.meta.env.VITE_API_URL}/api/favourites?deviceId=${encodeURIComponent(deviceId)}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then(setEntries)
      .catch((err) => {
        console.error('Failed to load favourites:', err);
        setError(true);
      });
  }, []);

  const visibleEntries = entries ? entries.filter((e) => favouriteIds.has(e.id)) : null;

  // Group city -> category, preserving the server's order (most-recently-
  // favourited first) for cities and, within a category, for cards - a Map
  // remembers insertion order, so the city containing the most recently
  // favourited entry naturally ends up first. Categories are then sorted
  // into CATEGORY_CONFIG's order (see the comment above Favourites()).
  const categoryOrder = Object.keys(CATEGORY_CONFIG);
  const orderOf = (slug) => {
    const i = categoryOrder.indexOf(slug);
    return i === -1 ? categoryOrder.length : i;
  };

  const groups = new Map();
  if (visibleEntries) {
    for (const entry of visibleEntries) {
      const city = entry.city;
      if (!groups.has(city.id)) groups.set(city.id, { city, categories: new Map() });
      const { categories } = groups.get(city.id);
      const slug = entry.category.slug;
      if (!categories.has(slug)) {
        categories.set(slug, { slug, title: getCategoryConfig(slug).title, entries: [] });
      }
      categories.get(slug).entries.push(entry);
    }
  }

  function renderCard(entry, city) {
    const config = getCategoryConfig(entry.category.slug);
    const variant = variantFor(entry);
    const currencySymbol = city.country?.currencySymbol || '$';
    // Local Cuisine (expandInPlace, see categoryConfig.js)
    // manages its own expand/collapse in place and only ever
    // navigates via its own "Edit" link - same reasoning
    // CategoryScreen.jsx already follows for not wrapping it
    // in a Link to a detail screen that, for this category,
    // doesn't get used in normal browsing.
    if (config.expandInPlace) {
      return (
        <EntryCard
          key={entry.id}
          entry={entry}
          variant={variant}
          currencySymbol={currencySymbol}
          showPrice={config.cardShowPrice ?? true}
          showPhone={config.cardShowPhone ?? false}
          countryCode={city.country?.code}
          showOpenStatus={config.cardShowOpenStatus ?? false}
          timezone={city.timezone}
          city={city}
          expandable
        />
      );
    }

    return (
      <Link
        to={`/category/${entry.category.slug}/entry/${entry.id}`}
        className="favourites-entry-link"
        key={entry.id}
      >
        <EntryCard
          entry={entry}
          variant={variant}
          currencySymbol={currencySymbol}
          showPrice={config.cardShowPrice ?? true}
          showPhone={config.cardShowPhone ?? false}
          countryCode={city.country?.code}
          showOpenStatus={config.cardShowOpenStatus ?? false}
          timezone={city.timezone}
          city={city}
        />
      </Link>
    );
  }

  return (
    <div className="favourites-screen">
      <div className="favourites-header">
        <h1>Favourites</h1>
      </div>

      {error && <div className="favourites-status">Couldn&apos;t load your favourites.</div>}

      {!error && visibleEntries === null && <div className="favourites-status">Loading…</div>}

      {!error && visibleEntries !== null && visibleEntries.length === 0 && (
        <div className="favourites-status">
          Nothing saved yet. Tap the heart on any place to bookmark it here.
        </div>
      )}

      {!error &&
        visibleEntries !== null &&
        visibleEntries.length > 0 &&
        Array.from(groups.values()).map(({ city, categories }) => (
          <div className="favourites-group" key={city.id}>
            <h2 className="favourites-group-title">{city.name}</h2>
            {Array.from(categories.values())
              .sort((a, b) => orderOf(a.slug) - orderOf(b.slug))
              .map(({ slug, title, entries: typeEntries }) => (
                <section className="favourites-type-group" key={slug}>
                  <span className="favourites-type-pill">{title}</span>
                  <div className="favourites-list">
                    {typeEntries.map((entry) => renderCard(entry, city))}
                  </div>
                </section>
              ))}
          </div>
        ))}

      <BottomNav />
    </div>
  );
}

export default Favourites;
