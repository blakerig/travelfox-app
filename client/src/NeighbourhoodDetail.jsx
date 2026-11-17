import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCityData } from './city-data-context.js';
import { useAuth } from './auth-context.js';
import { authHeaders } from './auth.js';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import AreaBody from './AreaBody.jsx';
import { hasAreaBody } from './areaSections.js';
// Reuses ActivityTypeDetail's layout styles (header, photo, name, markdown)
// so an Area's screen looks like the rest of the app; NeighbourhoodDetail.css
// only adds what's specific to Areas (the summary lead and labelled sections).
import './ActivityTypeDetail.css';
import './NeighbourhoodDetail.css';

// Standalone page for one Area (Neighbourhood row) - added 2026-11-17. Day to
// day, Areas are read in the map's drag-up panel (AreaSheet.jsx); this page
// exists so an Area has its own link (bookmarks, sharing) and is where
// NeighbourhoodEditor.jsx returns to after a save. Both use AreaBody.jsx for
// the write-up itself.
//
// Same cache-first-then-fetch pattern as ActivityTypeDetail.jsx, so a
// bookmarked /neighbourhoods/:id link still works.

const STATUS_LABELS = { DRAFT: 'Draft', AWAITING_REVIEW: 'Awaiting Review' };

function NeighbourhoodDetail() {
  const { areaId } = useParams();
  const { cityData, cityDataReady } = useCityData();
  const { canEdit } = useAuth();

  const cached = cityData?.neighbourhoods?.find((n) => String(n.id) === areaId) ?? null;

  const [fetched, setFetched] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadedId, setLoadedId] = useState(null);

  if (areaId !== loadedId) {
    setLoadedId(areaId);
    setFetched(null);
    setNotFound(false);
  }

  useEffect(() => {
    if (!cityDataReady || cached) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/neighbourhoods/${areaId}`, { headers: authHeaders() })
      .then((res) => {
        if (res.status === 404 || res.status === 400) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setFetched(data);
      })
      .catch((err) => console.error('Failed to fetch area:', err));
  }, [areaId, cityDataReady, cached]);

  const area = cached ?? fetched;
  // Back goes to the map with this Area still selected, rather than
  // whichever Area the map would pick by default.
  const backTo = area ? `/neighbourhoods?area=${area.id}` : '/neighbourhoods';

  return (
    <div className="activity-type-detail">
      <div className="activity-type-detail-header">
        <Link to={backTo} className="activity-type-detail-back" aria-label="Back to the map">
          &larr;
        </Link>
        {area && canEdit && (
          <div className="activity-type-detail-header-actions">
            <Link to={`/neighbourhoods/${area.id}/edit`} className="activity-type-detail-add">
              Edit
            </Link>
          </div>
        )}
      </div>

      {notFound && <div className="activity-type-detail-status">Couldn&apos;t find this area.</div>}
      {!notFound && !area && <div className="activity-type-detail-status">Loading…</div>}

      {area && (
        <div className="activity-type-detail-body">
          {area.photoUrl && (
            <img src={getEntryPhotoUrl(area.photoUrl)} alt="" className="activity-type-detail-photo" />
          )}

          <h1 className="activity-type-detail-name">{area.name}</h1>

          {/* Only ever visible to logged-in team members, since anonymous
              visitors never receive non-published Areas from the API. */}
          {area.status && area.status !== 'PUBLISHED' && (
            <span className="area-detail-status-badge">{STATUS_LABELS[area.status] ?? area.status}</span>
          )}

          {area.summary && <p className="area-detail-summary">{area.summary}</p>}

          <AreaBody area={area} />

          {!area.summary && !hasAreaBody(area) && (
              <div className="activity-type-detail-status">Nothing written about this area yet.</div>
            )}
        </div>
      )}
    </div>
  );
}

export default NeighbourhoodDetail;
