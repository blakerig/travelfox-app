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
// instead - no rating/address on the card itself (Eating Out, Sightseeing),
// those still show on entry-detail. 'reference' is text-only (Essentials).
// 'group' (2026-08-28) is an ActivityType card on the Activities category
// screen itself - name, a provider count, and the type's own optional
// description as the snippet - see groupedByType in categoryConfig.js and
// ActivityType in schema.prisma. ('photo' was named 'restaurant' until
// Sightseeing started using the same layout, 2026-08-28 - see cardVariant
// in categoryConfig.js.)
//
// showPrice (default true, 'photo' variant only) lets a category hide
// priceLevel from the card even when it's set - Sightseeing entries don't
// carry a restaurant-style $/$$/$$$ tier, so its category config passes
// false (see categoryConfig.js's cardShowPrice).
//
// currencySymbol comes from the current city (City.currencySymbol) so
// priceLevel renders as e.g. "€€" rather than a hardcoded "$" - falls back
// to "$" for any city that hasn't had its currency fields set yet.
function EntryCard({ entry, variant, currencySymbol = '$', showPrice = true }) {
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

    return (
      <div className="entry-card entry-card-photo">
        {/* Real photo when Entry.photoUrl is set (uploaded via
            EntryEditor.jsx, hosted on Cloudinary - see claude/todo.md),
            falling back to the static placeholder otherwise. */}
        <img
          src={entry.photoUrl ? getEntryPhotoUrl(entry.photoUrl) : photoPlaceholder}
          alt=""
          className="entry-card-photo-img"
        />

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

          {previewText && <div className="entry-card-snippet">{snippet(previewText)}</div>}
        </div>
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
