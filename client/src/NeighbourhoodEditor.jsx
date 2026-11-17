import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import { useAuth } from './auth-context.js';
import { authHeaders, responseError, describeSaveError } from './auth.js';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import { geocodeAddress } from './geocode.js';
import { AREA_SECTIONS } from './areaSections.js';
// Reuses ActivityTypeEditor's form styles so the two editors look the same;
// NeighbourhoodEditor.css only adds the location row and the delete button.
import './ActivityTypeEditor.css';
import './NeighbourhoodEditor.css';

// Editor for an Area (Neighbourhood row) - added 2026-11-17 alongside
// GET/POST/PATCH/DELETE /api/neighbourhoods, so Areas no longer need
// server/seedNeighbourhoods.js or Prisma Studio to add or change.
//
// Routes (see App.jsx):
//   /neighbourhoods/new/edit       - create, via "+ Add" on the Areas map
//   /neighbourhoods/:areaId/edit   - edit, via "Edit this area" in the map's
//                                    drag-up panel (AreaSheet.jsx) or "Edit"
//                                    on the standalone NeighbourhoodDetail page
//
// Mirrors ActivityTypeEditor.jsx: same roles (Creator/Editor/Admin can
// edit, only Editor/Admin can publish, Tester is redirected away), same
// photo upload, same Markdown write/preview tabs for the main description.
// Delete is Editor/Admin only, matching the server.
function NeighbourhoodEditor() {
  const { areaId } = useParams();
  const navigate = useNavigate();
  const isCreate = areaId === 'new';
  const { city, loading: cityLoading } = useCity();
  const { cityData, cityDataReady, upsertNeighbourhood, removeNeighbourhood } = useCityData();
  const { user, isAuthenticated } = useAuth();
  const canPublish = isAuthenticated && (user.role === 'EDITOR' || user.role === 'ADMIN');
  const canDelete = canPublish;

  const [area, setArea] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadedAreaId, setLoadedAreaId] = useState(null);
  // Which areaId the form has actually been filled from - kept separate from
  // loadedAreaId so a background cache refresh never overwrites what you're
  // mid-typing (same reason as ActivityTypeEditor.jsx's populatedTypeId).
  const [populatedAreaId, setPopulatedAreaId] = useState(null);

  const [name, setName] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [geocodeStatus, setGeocodeStatus] = useState('idle'); // idle | loading | found | not-found | error
  const [geocodeName, setGeocodeName] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [descTab, setDescTab] = useState('write');
  const [sections, setSections] = useState(() => emptySections());
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (areaId !== loadedAreaId) {
    setLoadedAreaId(areaId);
    setArea(null);
    setNotFound(false);
    setError(null);
    setName('');
    setStatus('DRAFT');
    setLatitude('');
    setLongitude('');
    setGeocodeStatus('idle');
    setGeocodeName('');
    setSummary('');
    setDescription('');
    setDescTab('write');
    setSections(emptySections());
    setPhotoUrl('');
    setPhotoError(null);
    setNotes('');
  }

  // Edit mode: fill the form from the cache, falling back to a direct fetch
  // once the cache is ready and still doesn't have this id.
  useEffect(() => {
    if (isCreate || populatedAreaId === areaId) return;

    function populate(data) {
      setPopulatedAreaId(areaId);
      setArea(data);
      setName(data.name ?? '');
      setStatus(data.status ?? 'DRAFT');
      setLatitude(data.latitude != null ? String(data.latitude) : '');
      setLongitude(data.longitude != null ? String(data.longitude) : '');
      setSummary(data.summary ?? '');
      setDescription(data.description ?? '');
      setSections(
        Object.fromEntries(AREA_SECTIONS.map(({ field }) => [field, data[field] ?? '']))
      );
      setPhotoUrl(data.photoUrl ?? '');
      setNotes(data.notes ?? '');
    }

    const cached = cityData?.neighbourhoods?.find((n) => String(n.id) === areaId);
    if (cached) {
      populate(cached);
      return;
    }
    if (!cityDataReady) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/neighbourhoods/${areaId}`, { headers: authHeaders() })
      .then((res) => {
        if (res.status === 404 || res.status === 400) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) populate(data);
      })
      .catch((err) => console.error('Failed to fetch area:', err));
  }, [isCreate, areaId, populatedAreaId, cityData, cityDataReady]);

  const ready = isCreate ? Boolean(city) : area != null;

  // Looks up the Area's position from its name plus the city (e.g. "El Born,
  // Barcelona") via the same OpenStreetMap lookup EntryEditor.jsx's "Find
  // coordinates" uses. Nominatim usually returns the neighbourhood's centre
  // point, which is what the map pin wants. Fills the fields directly; you
  // can still type or adjust the numbers by hand afterwards.
  function handleFindLocation() {
    if (!name.trim()) return;
    setGeocodeStatus('loading');
    setGeocodeName('');
    const query = city?.name ? `${name.trim()}, ${city.name}` : name.trim();
    geocodeAddress(import.meta.env.VITE_API_URL, query)
      .then((result) => {
        if (!result) {
          setGeocodeStatus('not-found');
          return;
        }
        setLatitude(String(result.latitude));
        setLongitude(String(result.longitude));
        setGeocodeName(result.displayName ?? '');
        setGeocodeStatus('found');
      })
      .catch((err) => {
        console.error('Area location lookup failed:', err);
        setGeocodeStatus('error');
      });
  }

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
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }
    if (latitude.trim() === '' || longitude.trim() === '') {
      setError('The area needs a map position - use "Find on map" or type the coordinates.');
      return;
    }
    setSaving(true);
    setError(null);

    const body = {
      name,
      latitude: latitude.trim(),
      longitude: longitude.trim(),
      summary,
      description,
      ...sections,
      photoUrl,
      notes,
    };
    const request = isCreate
      ? fetch(`${import.meta.env.VITE_API_URL}/api/neighbourhoods`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ ...body, status, cityId: city.id }),
        })
      : fetch(`${import.meta.env.VITE_API_URL}/api/neighbourhoods/${areaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            ...body,
            // Same as ActivityTypeEditor.jsx: a Creator looking at an
            // already-published Area doesn't re-send PUBLISHED, which the
            // server would reject along with the rest of the save.
            status: canPublish || status !== 'PUBLISHED' ? status : undefined,
          }),
        });

    request
      .then((res) => {
        if (!res.ok) throw responseError(res);
        return res.json();
      })
      .then((saved) => {
        upsertNeighbourhood(saved);
        // Back to the map with this Area selected and its panel pulled up -
        // see ?area/?open in Neighbourhoods.jsx.
        navigate(`/neighbourhoods?area=${saved.id}&open=1`);
      })
      .catch((err) => {
        console.error('Failed to save area:', err);
        setError(describeSaveError(err));
      })
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (isCreate || !area) return;
    // A plain browser confirm is enough here: it's a team-only screen and
    // deleting is the one action on it that can't be undone.
    if (!window.confirm(`Delete "${area.name}"? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    fetch(`${import.meta.env.VITE_API_URL}/api/neighbourhoods/${areaId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw responseError(res);
        removeNeighbourhood(area.id);
        navigate('/neighbourhoods');
      })
      .catch((err) => {
        console.error('Failed to delete area:', err);
        setError(describeSaveError(err, 'delete this area'));
      })
      .finally(() => setDeleting(false));
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }
  if (user.role === 'TESTER') {
    return <Navigate to="/neighbourhoods" replace />;
  }

  const cancelTo = isCreate ? '/neighbourhoods' : `/neighbourhoods?area=${areaId}&open=1`;

  return (
    <div className="activity-type-editor">
      <div className="activity-type-editor-header">
        <Link to={cancelTo} className="activity-type-editor-back" aria-label="Cancel">
          &larr;
        </Link>
        <h1 className="activity-type-editor-title">{isCreate ? 'New area' : 'Edit area'}</h1>
      </div>

      {notFound && <div className="activity-type-editor-status">Couldn&apos;t find this area.</div>}
      {!notFound && (cityLoading || !ready) && (
        <div className="activity-type-editor-status">Loading…</div>
      )}

      {ready && (
        <form className="activity-type-editor-form" onSubmit={handleSave}>
          <label className="activity-type-editor-field">
            <span className="activity-type-editor-label">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="activity-type-editor-input"
              autoFocus={isCreate}
            />
          </label>

          <div className="activity-type-editor-field">
            <span className="activity-type-editor-label">Status</span>
            {!canPublish && status === 'PUBLISHED' ? (
              <div className="activity-type-editor-status-readonly">
                Published — only an editor can change this.
              </div>
            ) : (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="activity-type-editor-select"
              >
                <option value="DRAFT">Draft</option>
                <option value="AWAITING_REVIEW">Awaiting Review</option>
                {canPublish && <option value="PUBLISHED">Published</option>}
              </select>
            )}
            <p className="activity-type-editor-hint">
              {canPublish
                ? 'Only Published areas show on the map for visitors.'
                : "Flag this as Awaiting Review once it's ready for an editor to look at - only an editor can publish it."}
            </p>
          </div>

          <div className="activity-type-editor-field">
            <span className="activity-type-editor-label">Map position</span>
            <div className="area-editor-coords">
              <input
                type="text"
                inputMode="decimal"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="activity-type-editor-input"
                placeholder="Latitude, e.g. 41.3839"
                aria-label="Latitude"
              />
              <input
                type="text"
                inputMode="decimal"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="activity-type-editor-input"
                placeholder="Longitude, e.g. 2.1820"
                aria-label="Longitude"
              />
            </div>
            <button
              type="button"
              className="area-editor-find"
              onClick={handleFindLocation}
              disabled={!name.trim() || geocodeStatus === 'loading'}
            >
              {geocodeStatus === 'loading' ? 'Looking up…' : 'Find on map'}
            </button>
            {geocodeStatus === 'found' && (
              <p className="activity-type-editor-hint">
                Found{geocodeName ? `: ${geocodeName}` : ''}. Check the pin lands where you expect
                - you can adjust the numbers by hand.
              </p>
            )}
            {geocodeStatus === 'not-found' && (
              <p className="activity-type-editor-hint">
                Nothing found for that name. Try a different spelling, or paste coordinates from
                Google Maps (right-click a spot and click the numbers to copy them).
              </p>
            )}
            {geocodeStatus === 'error' && (
              <div className="activity-type-editor-error">The location lookup failed. Try again.</div>
            )}
            {geocodeStatus === 'idle' && (
              <p className="activity-type-editor-hint">
                Where the pin sits - roughly the middle of the area. &quot;Find on map&quot; looks
                it up from the name.
              </p>
            )}
          </div>

          <label className="activity-type-editor-field">
            <span className="activity-type-editor-label">Summary</span>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="activity-type-editor-input"
            />
            <span className="activity-type-editor-hint">
              One line, shown under the name when the pin is tapped on the map.
            </span>
          </label>

          <div className="activity-type-editor-field">
            <span className="activity-type-editor-label">Photo (optional)</span>
            {photoUrl && (
              <img
                src={getEntryPhotoUrl(photoUrl, { width: 400, height: 300 })}
                alt=""
                className="activity-type-editor-photo-preview"
              />
            )}
            <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploadingPhoto} />
            {uploadingPhoto && <span className="activity-type-editor-photo-status">Uploading…</span>}
            {photoUrl && !uploadingPhoto && (
              <button
                type="button"
                className="activity-type-editor-photo-remove"
                onClick={() => setPhotoUrl('')}
              >
                Remove photo
              </button>
            )}
            {photoError && <div className="activity-type-editor-error">{photoError}</div>}
          </div>

          <div className="activity-type-editor-field">
            <div className="activity-type-editor-desc-header">
              <span className="activity-type-editor-label">About the area (Markdown)</span>
              <div className="activity-type-editor-tabs">
                <button
                  type="button"
                  className={
                    descTab === 'write' ? 'activity-type-editor-tab is-active' : 'activity-type-editor-tab'
                  }
                  onClick={() => setDescTab('write')}
                >
                  Write
                </button>
                <button
                  type="button"
                  className={
                    descTab === 'preview' ? 'activity-type-editor-tab is-active' : 'activity-type-editor-tab'
                  }
                  onClick={() => setDescTab('preview')}
                >
                  Preview
                </button>
              </div>
            </div>
            {descTab === 'write' ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="activity-type-editor-textarea"
                rows={8}
              />
            ) : (
              <div className="activity-type-editor-preview">
                {description ? (
                  <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                    {description}
                  </ReactMarkdown>
                ) : (
                  <span className="activity-type-editor-preview-empty">Nothing to preview yet.</span>
                )}
              </div>
            )}
            <p className="activity-type-editor-hint">
              The main paragraph on the area&apos;s own screen: its character, history and what
              it&apos;s like to spend time there.
            </p>
          </div>

          {AREA_SECTIONS.map(({ field, label, hint }) => (
            <label className="activity-type-editor-field" key={field}>
              <span className="activity-type-editor-label">{label} (optional)</span>
              <textarea
                value={sections[field]}
                onChange={(e) => setSections((prev) => ({ ...prev, [field]: e.target.value }))}
                className="activity-type-editor-textarea"
                rows={2}
              />
              <span className="activity-type-editor-hint">{hint}</span>
            </label>
          ))}

          <label className="activity-type-editor-field">
            <span className="activity-type-editor-label">
              Notes (optional - for us only, never shown in the app)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="activity-type-editor-textarea"
              rows={3}
            />
          </label>

          {error && <div className="activity-type-editor-error">{error}</div>}

          <div className="activity-type-editor-actions">
            <Link to={cancelTo} className="activity-type-editor-cancel">
              Cancel
            </Link>
            <button type="submit" className="activity-type-editor-save" disabled={saving || deleting}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {!isCreate && canDelete && (
            <button
              type="button"
              className="area-editor-delete"
              onClick={handleDelete}
              disabled={saving || deleting}
            >
              {deleting ? 'Deleting…' : 'Delete this area'}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function emptySections() {
  return Object.fromEntries(AREA_SECTIONS.map(({ field }) => [field, '']));
}

export default NeighbourhoodEditor;
