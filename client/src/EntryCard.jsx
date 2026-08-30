import { useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import './EntryCard.css';
import photoPlaceholder from './assets/entry-photo-placeholder.svg';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';

// Strip common Markdown syntax for a plain-text card snippet. Entry.description
// is authored as Markdown (see project notes), but full formatted rendering
// (react-markdown) is deferred until there's an entry-detail screen to put it
// on - a card in a grid just needs a clean plain-text preview.
function stripMarkdown(text) {
  return text
    .replace(/[*_`]/g, '')
    .replace(/^-\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function snippet(text, max = 120) {
  if (!text) return '';
  const plain = stripMarkdown(text);
  return plain.length > max ? `${plain.slice(0, max).trim()}…` : plain;
}

// variant: 'venue' shows rating/price/address (Activities provider cards,
// via ActivityTypeDetail.jsx), 'photo' shows a photo plus a price/type line
// instead - no rating/address on the card itself (Eating Out, Sightseeing,
// Local Cuisine); on Eating Out/Sightseeing those still show on
// entry-detail, but Local Cuisine has no entry-detail screen in normal use
// (see `expandable` below). 'reference' is text-only (Essentials). 'group'
// (2026-08-28) is an ActivityType card on the Activities category screen
// itself - name, a provider count, and the type's own optional description
// as the snippet - see groupedByType in categoryConfig.js and ActivityType
// in schema.prisma. ('photo' was named 'restaurant' until Sightseeing
// started using the same layout, 2026-08-28 - see cardVariant in
// categoryConfig.js.)
//
// showPrice (default true, 'photo' variant only) lets a category hide
// priceLevel from the card even when it's set - Sightseeing/Local Cuisine
// entries don't carry a restaurant-style $/$$/$$$ tier, so their category
// config passes false (see categoryConfig.js's cardShowPrice).
//
// expandable (2026-08-29, 'photo' variant only) - when true, the card
// manages its own expand/collapse state instead of being wrapped in a Link
// by CategoryScreen (see expandInPlace in categoryConfig.js): tapping
// anywhere on the card toggles between the short snippet and the entry's
// full description, rendered as Markdown right there in the card, so
// there's no separate screen to open for something as short as a dish
// description. `editHref`, when provided, renders a small "Edit" link once
// the card is expanded (it stops click propagation so it navigates instead
// of re-collapsing the card first) - for an expandable category this is the
// only way to reach EntryEditor.jsx, since it skips the normal
// tap-card-to-EntryDetail-then-Edit path other categories use.
//
// currencySymbol comes from the current city (City.currencySymbol) so
// priceLevel renders as e.g. "€€" rather than a hardcoded "$" - falls back
// to "$" for any city that hasn't had its currency fields set yet.
function EntryCard({
  entry,
  variant,
  currencySymbol = '$',
  showPrice = true,
  expandable = false,
  editHref,
}) {
  const [expanded, setExpanded] = useState(false);

  // Prefer the hand-written summary (catchier, written for this exact spot)
  // and fall back to the full description when no summary has been set.
  //
  // 'group' cards (ActivityType, see schema.prisma) invert this: description
  // is the type's primary "what is this activity" explanation, so it takes
  // priority there, with summary only as a fallback for when no description
  // has been written yet. See the comment on ActivityType.summary.
  const previewText =
    variant === 'group'
      ? entry.description?.trim() || entry.summary
      : entry.summary?.trim() || entry.description;

  if (variant === 'photo') {
    const showPriceMeta = showPrice && entry.priceLevel != null;
    const hasMeta = showPriceMeta || entry.type;

    const photo = (
      <img
        src={entry.photoUrl ? getEntryPhotoUrl(entry.photoUrl) : photoPlaceholder}
        alt=""
        className="entry-card-photo-img"
      />
    );

    const body = (
      <div className="entry-card-body">
        <div className="entry-card-name">{entry.name}</div>

        {hasMeta && (
          <div className="entry-card-meta">
            {showPriceMeta && (
              <span className="entry-card-price">
                {currencySymbol.repeat(entry.priceLevel)}
              </span>
            )}
            {showPriceMeta && entry.type && (
              <span className="entry-card-meta-sep" aria-hidden="true">
                &middot;
              </span>
            )}
            {entry.type && <span className="entry-card-type">{entry.type}</span>}
          </div>
        )}

        {expandable && expanded ? (
          <>
            <div className="entry-card-full-text">
              {entry.description ? (
                <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                  {entry.description}
                </ReactMarkdown>
              ) : (
                <p>No description yet.</p>
              )}
            </div>
            <div className="entry-card-expand-row">
              <span className="entry-card-expand-toggle">Show less</span>
              {editHref && (
                <Link
                  to={editHref}
                  className="entry-card-edit-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  Edit
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            {previewText && <div className="entry-card-snippet">{snippet(previewText)}</div>}
            {expandable && <span className="entry-card-expand-toggle">Read more</span>}
          </>
        )}
      </div>
    );

    if (expandable) {
      return (
        <div
          className={`entry-card entry-card-photo entry-card-expandable${
            expanded ? ' is-expanded' : ''
          }`}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
        >
          {photo}
          {body}
        </div>
      );
    }

    return (
      <div className="entry-card entry-card-photo">
        {photo}
        {body}
      </div>
    );
  }

  return (
    <div className="entry-card">
      <div className="entry-card-name">{entry.name}</div>

      {variant === 'venue' && (
        <div className="entry-card-meta">
          {entry.rating != null && (
            <span className="entry-card-rating">★ {entry.rating.toFixed(1)}</span>
          )}
          {entry.priceLevel != null && (
            <span className="entry-card-price">{currencySymbol.repeat(entry.priceLevel)}</span>
          )}
          {entry.address && <span className="entry-card-address">{entry.address}</span>}
        </div>
      )}

      {variant === 'group' && entry.entries?.length > 0 && (
        <div className="entry-card-meta">
          <span className="entry-card-count">
            {entry.entries.length} {entry.entries.length === 1 ? 'provider' : 'providers'}
          </span>
        </div>
      )}

      {previewText && <div className="entry-card-snippet">{snippet(previewText)}</div>}
    </div>
  );
}

export default EntryCard;
