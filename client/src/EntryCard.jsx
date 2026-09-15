import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import './EntryCard.css';
import photoPlaceholder from './assets/entry-photo-placeholder.svg';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import { isOpenNow } from './openingHours.js';
import { formatPhoneNumber } from './phoneNumber.js';
import { formatEntryAddress } from './address.js';

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
//
// showOpenStatus/timezone (2026-09-02, 'photo' variant only) render a
// compact "Open now"/"Closed" pill over the top-left corner of the photo,
// computed by isOpenNow() (openingHours.js) from entry.openingTimes and
// `timezone` - the entry's *city* timezone (City.timezone), passed down
// from CategoryScreen.jsx/Search.jsx, not the viewer's own device
// timezone (see the discussion in claude/todo.md). isOpenNow returning
// null (no parseable hours, or no timezone) hides the badge entirely
// rather than showing a "don't know" state - same as showPrice/showPhone
// only rendering when there's real data. See categoryConfig.js's
// cardShowOpenStatus for the per-category on/off switch.
//
// countryCode (2026-09-14, 'photo' variant only) is the current city's
// Country.code (ISO alpha-2, e.g. "ES") - passed down alongside
// currencySymbol so phoneNumber.js's formatPhoneNumber can fill in a dial
// code for any entry.phone that doesn't already start with "+". See
// phoneNumber.js for the full rule.
//
// city (2026-09-14, 'venue' variant only - see below) is the current City
// itself, not just its name, so address.js's formatEntryAddress can drop a
// trailing city name from entry.address when it's redundant with the
// section already being viewed. See address.js for the full rule.
//
// Publish-status badge (2026-09-15) - entry.status is 'DRAFT' |
// 'AWAITING_REVIEW' | 'PUBLISHED' (see the Publish workflow note in
// EntryEditor.jsx / EntryStatus in schema.prisma). The server only ever
// returns non-published entries to an authenticated editor/creator in the
// first place, so this badge doesn't gate on isAuthenticated itself - it
// just flags, for whoever *is* seeing the card, which ones are Draft or
// Awaiting Review and therefore still need attention. A card with no
// `status` at all (a 'group' ActivityType row isn't an Entry - see
// schema.prisma) or one that's Published renders neither the badge nor the
// border accent below, so a normal published list looks exactly as it did
// before this existed.
const STATUS_BADGES = {
  DRAFT: { label: 'Draft', modifier: 'draft' },
  AWAITING_REVIEW: { label: 'Awaiting review', modifier: 'awaiting-review' },
};

function EntryCard({
  entry,
  variant,
  currencySymbol = '$',
  showPrice = true,
  showPhone = false,
  countryCode,
  showOpenStatus = false,
  timezone,
  city,
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

  const statusInfo = STATUS_BADGES[entry.status] || null;
  const statusBadge = statusInfo ? (
    <div className={`entry-card-status-badge is-${statusInfo.modifier}`}>{statusInfo.label}</div>
  ) : null;
  const statusCardClass = statusInfo ? ` entry-card-status-${statusInfo.modifier}` : '';

  if (variant === 'photo') {
    const showPriceMeta = showPrice && entry.priceLevel != null;
    // entry.types (2026-08-30, array - was a single `type` string) can
    // hold more than one value (a pinchos-and-Catalan restaurant, a
    // Japanese/Mexican fusion place) - joined into one comma-separated
    // label for the card's compact meta line, same spot the single value
    // used to render.
    const typesLabel = entry.types?.length ? entry.types.join(', ') : null;
    const formattedPhone = showPhone ? formatPhoneNumber(entry.phone, countryCode) : null;
    const showPhoneMeta = Boolean(formattedPhone);

    // Meta line segments as an array (2026-09-02, was two hand-special-cased
    // segments before phone was added) so a middot separator only appears
    // between whichever segments actually end up present, in any
    // combination, without a growing pile of pairwise `showX && showY &&`
    // checks. Order here is display order: price, then type/cuisine, then
    // phone.
    //
    // The phone segment is a <button>, not a plain <span> like the others -
    // it's the only clickable one. This card is normally rendered inside a
    // CategoryScreen/Search-supplied <Link> to the entry-detail screen (see
    // CategoryScreen.jsx), so tapping the phone number needs to trigger a
    // call instead of navigating - stopPropagation keeps the click from
    // reaching that outer Link, and preventDefault is just defensive (a
    // <button> has no default navigation of its own). Deliberately a
    // <button>, not a nested <a href="tel:...">, since a nested <a> inside
    // the outer Link's own <a> would be invalid HTML.
    const metaSegments = [
      showPriceMeta && (
        <span key="price" className="entry-card-price">
          {currencySymbol.repeat(entry.priceLevel)}
        </span>
      ),
      typesLabel && (
        <span key="types" className="entry-card-type">
          {typesLabel}
        </span>
      ),
      showPhoneMeta && (
        <button
          key="phone"
          type="button"
          className="entry-card-phone"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = formattedPhone.href;
          }}
        >
          &#9742; {formattedPhone.display}
        </button>
      ),
    ].filter(Boolean);
    const hasMeta = metaSegments.length > 0;

    // Only computed for the 'photo' variant - the badge has nowhere sensible
    // to sit on the plain-text 'venue'/'reference'/'group' cards, and none
    // of those variants pass showOpenStatus today anyway (see
    // categoryConfig.js).
    const openStatus = showOpenStatus ? isOpenNow(entry.openingTimes, timezone) : null;
    const openBadge =
      openStatus != null ? (
        <div
          className={`entry-card-open-badge ${openStatus ? 'is-open' : 'is-closed'}`}
        >
          {openStatus ? 'Open now' : 'Closed'}
        </div>
      ) : null;

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
            {metaSegments.map((segment, i) => (
              <Fragment key={segment.key}>
                {i > 0 && (
                  <span className="entry-card-meta-sep" aria-hidden="true">
                    &middot;
                  </span>
                )}
                {segment}
              </Fragment>
            ))}
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
          className={`entry-card entry-card-photo entry-card-expandable${statusCardClass}${
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
          {openBadge}
          {statusBadge}
          {body}
        </div>
      );
    }

    return (
      <div className={`entry-card entry-card-photo${statusCardClass}`}>
        {photo}
        {openBadge}
        {statusBadge}
        {body}
      </div>
    );
  }

  return (
    <div className={`entry-card${statusCardClass}`}>
      <div className="entry-card-name-row">
        <div className="entry-card-name">{entry.name}</div>
        {statusBadge}
      </div>

      {variant === 'venue' && (
        <div className="entry-card-meta">
          {entry.rating != null && (
            <span className="entry-card-rating">★ {entry.rating.toFixed(1)}</span>
          )}
          {entry.priceLevel != null && (
            <span className="entry-card-price">{currencySymbol.repeat(entry.priceLevel)}</span>
          )}
          {entry.address && (
            <span className="entry-card-address">{formatEntryAddress(entry.address, city)}</span>
          )}
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
