import { Link, useParams } from 'react-router-dom';
import { getCategoryConfig } from './categoryConfig.js';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import EntryCard from './EntryCard.jsx';
import { activityTypeHref } from './activityTypeHref.js';
import './ActivityTypeDetail.css';

// Detail screen for one ActivityTypeCluster (e.g. "Racquet Sports") -
// reached by tapping a cluster card on CategoryScreen (see displayRows
// there and ActivityTypeCluster in schema.prisma). Lists each member
// ActivityType (Padel, Squash, Badminton, ...) as its own ordinary card,
// using the exact same cardVariant and activityTypeHref navigation
// CategoryScreen already uses for an *ungrouped* ActivityType - tapping
// one goes to its normal ActivityTypeDetail screen, or straight to its
// single provider when that shortcut applies, exactly as if it had never
// been clustered at all. The cluster itself only changes which screen you
// pass through on the way there, not how a member behaves once you've
// tapped it.
//
// Deliberately a plain drill-down screen, not an in-place expansion
// (2026-10-17, Blake's call, changed from an earlier accordion version
// that expanded both tiers on CategoryScreen itself) - simpler, and
// consistent with how every other card in this app already works: one
// tap, one new screen, the same back arrow convention as
// ActivityTypeDetail.jsx/ShopTypeDetail.jsx.
//
// Reuses ActivityTypeDetail.css rather than its own stylesheet - the
// header (back arrow)/body (name + card list) structure is identical,
// just listing ActivityType cards here instead of provider Entry cards.
//
// No dedicated server fetch: members are derived from the current city's
// already-cached activityTypes bundle (each one already carries its
// embedded `cluster`, see GET /api/cities/:cityId/activity-types), the
// same cache-first approach ActivityTypeDetail.jsx uses before falling
// back to a direct fetch. No fallback fetch is written here (unlike
// ActivityTypeDetail.jsx's bookmarked-link case) since the only way to
// reach this screen today is by tapping a cluster card that only exists
// once the bundle has already loaded - revisit if a cluster ever gets a
// shareable/bookmarked link of its own.
function ActivityClusterDetail() {
  const { slug, clusterId } = useParams();
  const config = getCategoryConfig(slug);
  const { city } = useCity();
  const { cityData, cityDataReady } = useCityData();
  const currencySymbol = city?.country?.currencySymbol || '$';
  const countryCode = city?.country?.code;

  const members = (cityData?.activityTypes ?? []).filter(
    (type) => String(type.cluster?.id) === clusterId
  );
  const clusterName = members[0]?.cluster?.name ?? null;

  return (
    <div className="activity-type-detail">
      <div className="activity-type-detail-header">
        <Link to={`/category/${slug}`} className="activity-type-detail-back" aria-label="Back">
          &larr;
        </Link>
      </div>

      {!cityDataReady && <div className="activity-type-detail-status">Loading…</div>}
      {cityDataReady && members.length === 0 && (
        <div className="activity-type-detail-status">Couldn&apos;t find this activity.</div>
      )}

      {members.length > 0 && (
        <div className="activity-type-detail-body">
          <h1 className="activity-type-detail-name">{clusterName}</h1>

          <div className="activity-type-detail-list">
            {members.map((member) => (
              <Link to={activityTypeHref(slug, member)} className="entry-card-link" key={member.id}>
                <EntryCard
                  entry={member}
                  variant={config.cardVariant}
                  currencySymbol={currencySymbol}
                  countryCode={countryCode}
                  city={city}
                />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivityClusterDetail;
