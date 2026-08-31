import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import './EntryDetail.css';
import { getCategoryConfig } from './categoryConfig.js';
import { useCity } from './city-context.js';
import photoPlaceholder from './assets/entry-photo-placeholder.svg';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';

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
  const currencySymbol = city?.country?.currencySymbol || '$';

  const [entry, setEntry] = useState(null);
  const [notFound, setNotFound] = useState(false);
  // Tracks which entryId `entry`/`notFound` currently belong to.
  const [loadedEntryId, setLoadedEntryId] = useState(null);

  // Reset to a loading state during render when we've navigated to a
  // different entry, rather than synchronously inside the effect - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (entryId !== loadedEntryId) {
    setLoadedEntryId(entryId);
    setEntry(null);
    setNotFound(false);
  }

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/entries/${entryId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setEntry(data);
      })
      .catch((err) => console.error('Failed to fetch entry:', err));
  }, [entryId]);

  const showMetaRow = config.cardVariant === 'venue' || config.cardVariant === 'photo';

  // Providers created under an ActivityType (see groupedByType in
  // categoryConfig.js) return to that type's screen rather than the flat
  // category list - entry.activityTypeId is only set for those entries
  // (see Entry.activityTypeId in schema.prisma), so this falls back to the
  // normal category screen for every other entry.
  const backTo = entry?.activityTypeId
    ? `/category/${slug}/type/${entry.activityTypeId}`
    : `/category/${slug}`;

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
