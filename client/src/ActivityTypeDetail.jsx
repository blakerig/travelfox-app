import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import './ActivityTypeDetail.css';
import { getCategoryConfig } from './categoryConfig.js';
import { useCity } from './city-context.js';
import EntryCard from './EntryCard.jsx';

// Detail screen for one ActivityType (e.g. "Laser Tag", "Padel") - reached
// by tapping a type card on CategoryScreen (see groupedByType in
// categoryConfig.js and ActivityType in schema.prisma). Shows the type's
// own optional description (same Markdown rendering as EntryDetail.jsx, for
// the same reasons - see the Content formatting convention in the project
// notes) followed by its provider Entries as cards, each linking through to
// the normal EntryDetail screen.
//
// A type with zero providers still renders correctly - that's a valid,
// deliberate state (e.g. too many providers to list individually, or not
// enough to differentiate), not an error condition, so no "nothing here"
// message shows unless there's *also* no description (see the empty state
// below).
//
// CategoryScreen skips this screen entirely and links straight to the
// single provider's EntryDetail when a type has no description and exactly
// one provider (see activityTypeHref in CategoryScreen.jsx) - this screen
// still renders correctly if reached directly anyway (e.g. a bookmarked
// link), just as a one-item provider list under an empty description.
function ActivityTypeDetail() {
  const { slug, typeId } = useParams();
  const config = getCategoryConfig(slug);
  const { city } = useCity();
  const currencySymbol = city?.country?.currencySymbol || '$';

  const [activityType, setActivityType] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadedTypeId, setLoadedTypeId] = useState(null);

  // Reset to a loading state during render when we've navigated to a
  // different type, rather than synchronously inside an effect - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (typeId !== loadedTypeId) {
    setLoadedTypeId(typeId);
    setActivityType(null);
    setNotFound(false);
  }

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/activity-types/${typeId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setActivityType(data);
      })
      .catch((err) => console.error('Failed to fetch activity type:', err));
  }, [typeId]);

  const providers = activityType?.entries ?? [];

  return (
    <div className="activity-type-detail">
      <div className="activity-type-detail-header">
        <Link to={`/category/${slug}`} className="activity-type-detail-back" aria-label="Back">
          &larr;
        </Link>
        {activityType && (
          <Link
            to={`/category/${slug}/entry/new/edit?activityTypeId=${activityType.id}`}
            className="activity-type-detail-add"
          >
            + Add provider
          </Link>
        )}
      </div>

      {notFound && (
        <div className="activity-type-detail-status">Couldn&apos;t find this activity.</div>
      )}
      {!notFound && !activityType && (
        <div className="activity-type-detail-status">Loading…</div>
      )}

      {activityType && (
        <div className="activity-type-detail-body">
          <h1 className="activity-type-detail-name">{activityType.name}</h1>

          {activityType.description && (
            <div className="activity-type-detail-markdown">
              <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                {activityType.description}
              </ReactMarkdown>
            </div>
          )}

          {providers.length > 0 && (
            <div className="activity-type-detail-list">
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
                  />
                </Link>
              ))}
            </div>
          )}

          {providers.length === 0 && !activityType.description && (
            <div className="activity-type-detail-status">Nothing here yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default ActivityTypeDetail;
