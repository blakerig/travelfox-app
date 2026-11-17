import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useCityData } from './city-data-context.js';
import { useAuth } from './auth-context.js';
import { authHeaders, responseError, describeSaveError } from './auth.js';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import './ActivityTypeClusterEditor.css';

// Minimal editor for an ActivityTypeCluster's own photo (e.g. "Racquet
// Sports") - added 2026-11-17 once Blake pointed out that the *cluster*
// card shown on CategoryScreen (see EntryCard.jsx's 'group' + photo
// overlay, and the synthetic clusterEntry built in CategoryScreen.jsx's
// renderRow) needs its own photo, distinct from any individual member
// ActivityType's photo (e.g. Padel's own picture, which only surfaces one
// screen deeper, on ActivityClusterDetail.jsx). See ActivityTypeCluster.
// photoUrl in schema.prisma.
//
// Deliberately scoped to just the photo (2026-11-17, Blake's call) -
// every other cluster field (name, slug, sortOrder, which ActivityTypes
// belong to it) stays Prisma-Studio-only exactly as before; this doesn't
// become a full cluster editor, just enough to set a photo without
// needing Prisma Studio for that - which can't upload to Cloudinary
// anyway, only store a URL you already have (see handlePhotoChange
// below, identical to ActivityTypeEditor.jsx's own).
//
// No create mode, unlike ActivityTypeEditor.jsx - a cluster has to
// already exist (made in Prisma Studio) before this screen is ever
// reachable at all, since it's only linked from "Edit" on
// ActivityClusterDetail.jsx's header.
//
// No dedicated GET-by-id endpoint either - clusters are global, not
// per-city (see ActivityTypeCluster in schema.prisma), and the full list
// is already fetched once by ensureActivityTypeClusters for
// ActivityTypeEditor.jsx's own Cluster dropdown, so this just reuses that
// same cache rather than adding a new server endpoint for a screen this
// small.
function ActivityTypeClusterEditor() {
  const { slug, clusterId } = useParams();
  const navigate = useNavigate();
  const { activityTypeClusters, ensureActivityTypeClusters, upsertActivityTypeCluster } =
    useCityData();
  const { user, isAuthenticated } = useAuth();

  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Display-only (the Save below never sends this) - just so the header
  // can say which cluster you're editing rather than a generic title.
  const [clusterName, setClusterName] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    ensureActivityTypeClusters();
  }, [ensureActivityTypeClusters]);

  // Populates once the shared cluster list has loaded - see the doc
  // comment above for why this reads from that cache rather than firing
  // its own fetch. Guarded by `loaded` (not just activityTypeClusters !==
  // null) the same way ActivityTypeEditor.jsx guards with populatedTypeId,
  // so a later cache refresh doesn't clobber whatever photo you're
  // mid-uploading.
  useEffect(() => {
    if (loaded || activityTypeClusters === null) return;
    const cluster = activityTypeClusters.find((c) => String(c.id) === clusterId);
    if (!cluster) {
      setNotFound(true);
      setLoaded(true);
      return;
    }
    setClusterName(cluster.name);
    setPhotoUrl(cluster.photoUrl ?? '');
    setLoaded(true);
  }, [loaded, activityTypeClusters, clusterId]);

  // Identical to ActivityTypeEditor.jsx's handlePhotoChange - same
  // /api/upload endpoint, same Cloudinary folder, same immediate-upload-
  // on-select behaviour (nothing is written to the cluster row itself
  // until Save).
  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);

    const formData = new FormData();
    formData.append('photo', file);

    fetch(`${import.meta.env.VITE_API_URL}/api/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    })
      .then((res) => {
        if (!res.ok) throw responseError(res, 'Upload');
        return res.json();
      })
      .then((data) => setPhotoUrl(data.url))
      .catch((err) => {
        console.error('Failed to upload photo:', err);
        setPhotoError(describeSaveError(err, 'upload the photo'));
      })
      .finally(() => setUploadingPhoto(false));
  }

  function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    fetch(`${import.meta.env.VITE_API_URL}/api/activity-type-clusters/${clusterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ photoUrl }),
    })
      .then((res) => {
        if (!res.ok) throw responseError(res);
        return res.json();
      })
      .then((saved) => {
        // Patches the shared activityTypeClusters cache in place (see
        // CityDataProvider.jsx) so CategoryScreen's cluster card shows
        // this save immediately on the very next screen - same reasoning
        // as ActivityTypeEditor.jsx's own upsertActivityType call.
        upsertActivityTypeCluster(saved);
        navigate(`/category/${slug}/cluster/${clusterId}`);
      })
      .catch((err) => {
        console.error('Failed to save activity type cluster:', err);
        setError(describeSaveError(err));
      })
      .finally(() => setSaving(false));
  }

  // Not just visually hidden - see the identical guard in
  // ActivityTypeEditor.jsx.
  if (!isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }
  // A Tester can see this screen's data (reads go through optionalAuth
  // the same as everything else) but has no write access, and the
  // server's requireRole(...) on the PATCH above would reject their save
  // anyway - same reasoning as the identical redirect in
  // ActivityTypeEditor.jsx.
  if (user.role === 'TESTER') {
    return <Navigate to={`/category/${slug}/cluster/${clusterId}`} replace />;
  }

  const cancelTo = `/category/${slug}/cluster/${clusterId}`;

  return (
    <div className="activity-type-cluster-editor">
      <div className="activity-type-cluster-editor-header">
        <Link to={cancelTo} className="activity-type-cluster-editor-back" aria-label="Cancel">
          &larr;
        </Link>
        <h1 className="activity-type-cluster-editor-title">
          {clusterName ? `Edit ${clusterName}` : 'Edit cluster'}
        </h1>
      </div>

      {notFound && (
        <div className="activity-type-cluster-editor-status">
          Couldn&apos;t find this cluster.
        </div>
      )}
      {!notFound && !loaded && (
        <div className="activity-type-cluster-editor-status">Loading…</div>
      )}

      {loaded && !notFound && (
        <form className="activity-type-cluster-editor-form" onSubmit={handleSave}>
          <div className="activity-type-cluster-editor-field">
            <span className="activity-type-cluster-editor-label">
              Photo (shown on the Activities screen itself, on this cluster&apos;s own card -
              not any one member&apos;s photo)
            </span>
            {photoUrl && (
              <img
                src={getEntryPhotoUrl(photoUrl, { width: 400, height: 300 })}
                alt=""
                className="activity-type-cluster-editor-photo-preview"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              disabled={uploadingPhoto}
            />
            {uploadingPhoto && (
              <span className="activity-type-cluster-editor-photo-status">Uploading…</span>
            )}
            {photoUrl && !uploadingPhoto && (
              <button
                type="button"
                className="activity-type-cluster-editor-photo-remove"
                onClick={() => setPhotoUrl('')}
              >
                Remove photo
              </button>
            )}
            {photoError && (
              <div className="activity-type-cluster-editor-error">{photoError}</div>
            )}
          </div>

          {error && <div className="activity-type-cluster-editor-error">{error}</div>}

          <div className="activity-type-cluster-editor-actions">
            <Link to={cancelTo} className="activity-type-cluster-editor-cancel">
              Cancel
            </Link>
            <button type="submit" className="activity-type-cluster-editor-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default ActivityTypeClusterEditor;
