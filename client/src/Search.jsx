import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Search.css';
import { useCity } from './city-context.js';
import { getCategoryConfig } from './categoryConfig.js';
import { activityTypeHref } from './activityTypeHref.js';
import EntryCard from './EntryCard.jsx';

// How long to wait after the last keystroke before firing a request -
// short enough to feel instant, long enough that a fast typist doesn't
// fire a request per character. See GET /api/cities/:cityId/search in
// server/index.js for what's actually being queried.
const DEBOUNCE_MS = 300;

// Below this length a query is too short to search meaningfully (e.g. a
// single letter would match almost every entry) - matches
// server/index.js's own "empty query -> []" behaviour but stops short of
// even firing that mostly-useless request.
const MIN_QUERY_LENGTH = 2;

// Badge label shown on each result card so a mixed list (a restaurant next
// to an activity type next to a sightseeing spot) still reads clearly at a
// glance - see "Unified search + result badges" in the product discussion
// that preceded this feature. Entry results use their own Category.name
// (already matches Home.jsx's category labels, e.g. "Eating Out" - see
// server/seed.js); ActivityType results don't carry a category from the
// server (see GET /api/cities/:cityId/search), so it's hardcoded here,
// same as Home.jsx hardcodes category labels for the icon grid.
function resultBadge(result) {
  return result.kind === 'activityType' ? 'Activities' : result.category.name;
}

// Where tapping a result card should go. Entry results link straight to
// EntryDetail, same as every other Entry link in the app. ActivityType
// results reuse CategoryScreen's own routing rule (skip straight to the
// lone provider when there's no description to show first) rather than
// duplicating that logic here.
function resultHref(result) {
  if (result.kind === 'activityType') {
    return activityTypeHref('activities', result);
  }
  return `/category/${result.category.slug}/entry/${result.id}`;
}

function Search() {
  const { city } = useCity();
  const currencySymbol = city?.country?.currencySymbol || '$';
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  // Which (trimmed) query `results` currently corresponds to - null before
  // the first fetch ever completes. Comparing this to the live query lets
  // "loading" be derived during render instead of tracked as its own piece
  // of state set synchronously inside the effect below (see the
  // set-state-in-effect note on that effect).
  const [resultsForQuery, setResultsForQuery] = useState(null);

  // Auto-focus the input the moment this screen mounts - it's reached by
  // tapping the search bar specifically to type, so the keyboard should be
  // up immediately rather than requiring a second tap.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Whether the current query is even long enough to search - derived
  // during render (not stored in state) so the effect below only ever has
  // to run when there's an actual fetch to make, per oxlint's
  // set-state-in-effect guidance: an effect should synchronize with an
  // external system (here, the search API), not reset local state that
  // render can just as easily compute itself.
  const trimmedQuery = query.trim();
  const searchable = Boolean(city) && trimmedQuery.length >= MIN_QUERY_LENGTH;
  // True from the moment the query becomes searchable until results for
  // *this exact* query have landed - covers both "still debouncing" and
  // "request in flight", without a separate state variable to keep in sync.
  const loading = searchable && resultsForQuery !== trimmedQuery;

  useEffect(() => {
    if (!searchable) return;

    const timer = setTimeout(() => {
      fetch(
        `${import.meta.env.VITE_API_URL}/api/cities/${city.id}/search?q=${encodeURIComponent(trimmedQuery)}`
      )
        .then((res) => res.json())
        .then((data) => {
          setResults(data);
          setResultsForQuery(trimmedQuery);
        })
        .catch((err) => {
          console.error('Search failed:', err);
          setResults([]);
          setResultsForQuery(trimmedQuery);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchable, city, trimmedQuery]);

  return (
    <div className="search-screen">
      <div className="search-header">
        <button
          type="button"
          className="search-back"
          aria-label="Back to home"
          onClick={() => navigate('/')}
        >
          &larr;
        </button>
        <div className="search-input-wrap">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <line x1="20" y1="20" x2="15.8" y2="15.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            className="search-input"
            placeholder={city ? `Search ${city.name}` : 'Search'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {trimmedQuery.length === 0 && (
        <div className="search-status">Search restaurants, activities, sights and more.</div>
      )}

      {trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH && (
        <div className="search-status">Keep typing…</div>
      )}

      {loading && <div className="search-status">Searching…</div>}

      {!loading && searchable && results !== null && (
        results.length === 0 ? (
          <div className="search-status">No results for &ldquo;{trimmedQuery}&rdquo;.</div>
        ) : (
          <div className="search-results">
            {results.map((result) => {
              const config = getCategoryConfig(
                result.kind === 'activityType' ? 'activities' : result.category.slug
              );
              // A provider Entry filed directly under Activities (matched
              // by its own name/summary, not via its ActivityType) uses
              // the 'venue' provider-card layout, not the 'group' layout
              // ActivityType cards use on CategoryScreen's Activities list
              // - see providerCardVariant in categoryConfig.js.
              const variant =
                result.kind === 'activityType'
                  ? 'group'
                  : result.category.slug === 'activities'
                    ? config.providerCardVariant
                    : config.cardVariant;
              return (
                <Link
                  to={resultHref(result)}
                  className="search-result"
                  key={`${result.kind}-${result.id}`}
                >
                  <div className="search-result-badge">{resultBadge(result)}</div>
                  <EntryCard
                    entry={result}
                    variant={variant}
                    currencySymbol={currencySymbol}
                    showPrice={config.cardShowPrice ?? true}
                  />
                </Link>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

export default Search;
