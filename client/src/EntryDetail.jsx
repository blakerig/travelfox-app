import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import './EntryDetail.css';
import { getCategoryConfig } from './categoryConfig.js';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import photoPlaceholder from './assets/entry-photo-placeholder.svg';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import { isOpenNow } from './openingHours.js';

// Prefixes a bare domain (e.g. "restaurant.com", typed without a scheme -
// see the hint on EntryEditor.jsx's Website field, which doesn't enforce
// one) with https:// so the link actually navigates rather than being
// resolved as a relative path on this app's own domain. Entry.website is
// free text, not validated at save time, so this has to tolerate either
// form.
function normalizeWebsiteUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Full-entry view, reached by tapping a card on CategoryScreen. Renders the
// full `description` as Markdown (bold/italic/bullets/headings) - see the
// Content formatting convention in the project notes for why description is
// authored as Markdown rather than plain text or HTML.
//
// remark-breaks: by default, standard Markdown collapses a single newline
// into a plain space - only a *blank* line starts a new paragraph. Content
// here is typed straight into a plain text box in Prisma Studio, where a
// single Enter press is the natural way to start a new line, so we treat
// single newlines as line breaks too rather than requiring authors to leave
// a blank line between every line.
//
// cardVariant still comes from categoryConfig (via the :slug in the URL) so
// the venue-style meta row (rating/price/type/address) only shows for
// categories that actually have that data - Essentials, the first category
// this was built/tested against, has none of it. Both 'venue' and 'photo'
// get this row here: the 'photo' card (Eating Out, Sightseeing) leaves
// rating/address off the card itself (2026-08-28 decision) but they're still
// useful on the full detail screen, so this screen doesn't distinguish
// between the two the way EntryCard.jsx does.
function EntryDetail() {
  const { slug, entryId } = useParams();
  const config = getCategoryConfig(slug);
  const { city } = useCity();
  const { cityData, cityDataReady } = useCityData();
  const currencySymbol = city?.country?.currencySymbol || '$';

  // Read straight out of the current city's cache first (see
  // CityDataProvider.jsx) - the common case, since this is normally
  // reached by tapping a card on CategoryScreen for whichever city is
  // already selected.
  const cachedEntry = cityData?.entries.find((e) => String(e.id) === entryId) ?? null;

  const [fetchedEntry, setFetchedEntry] = useState(null);
  const [notFound, setNotFound] = useState(false);
  // Tracks which entryId `fetchedEntry`/`notFound` currently belong to.
  const [loadedEntryId, setLoadedEntryId] = useState(null);

  // Reset to a loading state during render when we've navigated to a
  // different entry, rather than synchronously inside the effect - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (entryId !== loadedEntryId) {
    setLoadedEntryId(entryId);
    setFetchedEntry(null);
    setNotFound(false);
  }

  // Falls back to a direct fetch-by-id only once the current city's cache
  // has loaded AND still doesn't have this entry - i.e. a bookmarked/
  // shared link to an Entry belonging to a city other than whatever's
  // currently selected. Waiting for cityDataReady first avoids firing a
  // redundant fetch during the ordinary case where the entry simply hasn't
  // finished loading into the cache yet.
  useEffect(() => {
    if (!cityDataReady || cachedEntry) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/entries/${entryId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setFetchedEntry(data);
      })
      .catch((err) => console.error('Failed to fetch entry:', err));
  }, [entryId, cityDataReady, cachedEntry]);

  const entry = cachedEntry ?? fetchedEntry;

  const showMetaRow = config.cardVariant === 'venue' || config.cardVariant === 'photo';

  // Providers created under an ActivityType (see groupedByType in
  // categoryConfig.js) return to that type's screen rather than the flat
  // category list - entry.activityTypeId is only set for those entries
  // (see Entry.activityTypeId in schema.prisma), so this falls back to the
  // normal category screen for every other entry.
  const backTo = entry?.activityTypeId
    ? `/category/${slug}/type/${entry.activityTypeId}`
    : `/category/${slug}`;

  // Uses the *city's* timezone (City.timezone), not the viewer's own device
  // time - see the doc comment on EntryCard.jsx's showOpenStatus prop and
  // the discussion in claude/todo.md. null (no parseable opening-hours
  // text, or no timezone set for this city yet) means "don't show a
  // status" - handled below by simply not rendering the badge.
  const openStatus = entry ? isOpenNow(entry.openingTimes, city?.timezone) : null;

  return (
    <div className="entry-detail">
      <div className="entry-detail-header">
        <Link to={backTo} className="entry-detail-back" aria-label="Back">
          &larr;
        </Link>
        {entry && (
          <Link to={`/category/${slug}/entry/${entryId}/edit`} className="entry-detail-edit">
            Edit
          </Link>
        )}
      </div>

      {notFound && <div className="entry-detail-status">Couldn&apos;t find this entry.</div>}
      {!notFound && !entry && <div className="entry-detail-status">Loading…</div>}

      {entry && config.cardVariant === 'photo' && (
        <img
          src={entry.photoUrl ? getEntryPhotoUrl(entry.photoUrl) : photoPlaceholder}
          alt=""
          className="entry-detail-photo"
        />
      )}

      {entry && (
        <div className="entry-detail-body">
          <h1 className="entry-detail-name">{entry.name}</h1>

          {showMetaRow && (
            <div className="entry-detail-meta">
              {entry.rating != null && (
                <span className="entry-detail-rating">★ {entry.rating.toFixed(1)}</span>
              )}
              {entry.priceLevel != null && <span>{currencySymbol.repeat(entry.priceLevel)}</span>}
              {entry.types?.length > 0 && <span>{entry.types.join(', ')}</span>}
              {entry.address && <span>{entry.address}</span>}
            </div>
          )}

          {/* Contact block (2026-09-02) - phone/website/opening times, each
              shown only if set. Deliberately separate from entry-detail-meta
              above rather than folded into it: those are short inline
              facts, these are each a labeled, often-clickable row (tap to
              call, tap to open the site), so they need their own layout.
              Not gated by cardVariant/showMetaRow the way the meta row is -
              these fields are free to appear on any category's detail
              screen once populated (see Entry.phone/website/openingTimes in
              schema.prisma), even though only Eating Out enters them today. */}
          {(entry.phone || entry.website || entry.openingTimes) && (
            <div className="entry-detail-contact">
              {entry.phone && (
                <a href={`tel:${entry.phone}`} className="entry-detail-contact-row">
                  <span className="entry-detail-contact-label">Call</span>
                  <span className="entry-detail-contact-value">{entry.phone}</span>
                </a>
              )}
              {entry.website && (
                <a
                  href={normalizeWebsiteUrl(entry.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="entry-detail-contact-row"
                >
                  <span className="entry-detail-contact-label">Website</span>
                  <span className="entry-detail-contact-value">{entry.website}</span>
                </a>
              )}
              {entry.openingTimes && (
                <div className="entry-detail-contact-row">
                  <span className="entry-detail-contact-label">Hours</span>
                  {/* openStatus (2026-09-02, see the const above) renders as a
                      badge right next to the "Hours" label when it can be
                      confidently determined - null (unparseable hours, or
                      no city timezone) just omits the badge rather than
                      guessing. */}
                  {openStatus != null && (
                    <span
                      className={`entry-detail-open-badge ${
                        openStatus ? 'is-open' : 'is-closed'
                      }`}
                    >
                      {openStatus ? 'Open now' : 'Closed'}
                    </span>
                  )}
                  {/* Split on "," or ";" purely for display - one day-range
                      clause per line, matching the convention documented on
                      Entry.openingTimes in schema.prisma (comma is the
                      current convention; semicolon still works too, see
                      openingHours.js). This is not parsing in the sense of
                      understanding what the values mean, just a
                      readability win over one long run-on line - the
                      actual parsing that drives openStatus above happens
                      in openingHours.js. */}
                  <span className="entry-detail-contact-value entry-detail-hours-value">
                    {entry.openingTimes.split(/[,;]/).map((line, i) => (
                      <div key={i}>{line.trim()}</div>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}

          {entry.description ? (
            <div className="entry-detail-markdown">
              <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                {entry.description}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="entry-detail-status">No description yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default EntryDetail;
