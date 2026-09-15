import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import './ShopTypeDetail.css';
import { getCategoryConfig } from './categoryConfig.js';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import { useAuth } from './auth-context.js';
import EntryCard from './EntryCard.jsx';

// Detail screen for one ShopType (e.g. "Local Markets", "Souvenirs") -
// reached by tapping a type card on CategoryScreen (see groupedByType in
// categoryConfig.js and ShopType in schema.prisma). A near-exact mirror of
// ActivityTypeDetail.jsx - same Markdown rendering, same provider-list
// pattern, same "skip straight to the lone provider" routing rule (see
// activityTypeHref.js, shared by both) - kept as its own file rather than a
// config-driven shared component so Shopping's simpler shape (no
// ActivityGroup-style grouping at all) never has to thread an
// always-false/undefined branch through Activities' file, and vice versa.
//
// A type with zero providers still renders correctly - see
// ActivityTypeDetail.jsx's doc comment for the fuller reasoning, which
// applies here unchanged.
function ShopTypeDetail() {
  const { slug, typeId } = useParams();
  const config = getCategoryConfig(slug);
  const { city } = useCity();
  const { cityData, cityDataReady } = useCityData();
  const { isAuthenticated } = useAuth();
  const currencySymbol = city?.country?.currencySymbol || '$';
  const countryCode = city?.country?.code;

  // Read straight out of the current city's cache first (see
  // CityDataProvider.jsx) - the common case, since this is normally reached
  // by tapping a type card on CategoryScreen for whichever city is already
  // selected.
  const cachedType = cityData?.shopTypes.find((t) => String(t.id) === typeId) ?? null;

  const [fetchedType, setFetchedType] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadedTypeId, setLoadedTypeId] = useState(null);

  // Reset to a loading state during render when we've navigated to a
  // different type, rather than synchronously inside an effect - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (typeId !== loadedTypeId) {
    setLoadedTypeId(typeId);
    setFetchedType(null);
    setNotFound(false);
  }

  // Falls back to a direct fetch-by-id only once the current city's cache
  // has loaded AND still doesn't have this type - i.e. a bookmarked/shared
  // link to a ShopType belonging to a city other than whatever's currently
  // selected (see the doc comment above this component about this screen
  // working when reached directly). Waiting for cityDataReady first avoids
  // firing a redundant fetch during the ordinary case where the type simply
  // hasn't finished loading into the cache yet.
  useEffect(() => {
    if (!cityDataReady || cachedType) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/shop-types/${typeId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setFetchedType(data);
      })
      .catch((err) => console.error('Failed to fetch shop type:', err));
  }, [typeId, cityDataReady, cachedType]);

  const shopType = cachedType ?? fetchedType;
  const providers = shopType?.entries ?? [];

  return (
    <div className="shop-type-detail">
      <div className="shop-type-detail-header">
        <Link to={`/category/${slug}`} className="shop-type-detail-back" aria-label="Back">
          &larr;
        </Link>
        {shopType && isAuthenticated && (
          <div className="shop-type-detail-header-actions">
            {/* Edits the type itself (name/summary/description) via
                ShopTypeEditor.jsx - distinct from "+ Add provider" below
                which adds a new Entry under this type instead. */}
            <Link to={`/category/${slug}/type/${shopType.id}/edit`} className="shop-type-detail-add">
              Edit
            </Link>
            <Link
              to={`/category/${slug}/entry/new/edit?shopTypeId=${shopType.id}`}
              className="shop-type-detail-add"
            >
              + Add provider
            </Link>
          </div>
        )}
      </div>

      {notFound && (
        <div className="shop-type-detail-status">Couldn&apos;t find this shop type.</div>
      )}
      {!notFound && !shopType && (
        <div className="shop-type-detail-status">Loading…</div>
      )}

      {shopType && (
        <div className="shop-type-detail-body">
          <h1 className="shop-type-detail-name">{shopType.name}</h1>

          {shopType.description && (
            <div className="shop-type-detail-markdown">
              <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                {shopType.description}
              </ReactMarkdown>
            </div>
          )}

          {providers.length > 0 && (
            <div className="shop-type-detail-list">
              {providers.map((entry) => (
                <Link
                  to={`/category/${slug}/entry/${entry.id}`}
                  className="entry-card-link"
                  key={entry.id}
                >
                  <EntryCard
                    entry={entry}
                    variant={config.providerCardVariant ?? 'venue'}
                    currencySymbol={currencySymbol}
                    countryCode={countryCode}
                    city={city}
                  />
                </Link>
              ))}
            </div>
          )}

          {providers.length === 0 && !shopType.description && (
            <div className="shop-type-detail-status">Nothing here yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default ShopTypeDetail;
