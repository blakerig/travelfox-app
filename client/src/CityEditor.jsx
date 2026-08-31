import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCity } from './city-context.js';
import { getCityPhotoUrl } from './cloudinaryUrl.js';
import './CityEditor.css';

// Small, single-purpose editor for a City's cover photo - reached via the
// pencil icon next to the city name on Home.jsx. City has no other in-app
// editor: name/latitude/longitude/countryId are all still Prisma
// Studio-only (see claude/home-screen-spec.md), so this deliberately
// doesn't try to be a full "edit city" screen - it exists only because
// photoUrl needed *some* way to be set that isn't "upload an entry photo
// just to steal its URL and paste it into Studio." Same photo-upload
// mechanics as EntryEditor.jsx's photo field (upload immediately on file
// selection so the preview updates, PATCH only fires on Save), reused here
// rather than duplicated into a shared component since there's only one
// other field in this whole form.
function CityEditor() {
  const { cityId } = useParams();
  const navigate = useNavigate();
  const { cities, updateCity } = useCity();

  const city = cities.find((c) => c.id === Number(cityId));

  const [photoUrl, setPhotoUrl] = useState(city?.photoUrl ?? '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Same upload flow as EntryEditor.jsx: the file goes to the server's
  // /api/upload endpoint (Cloudinary) immediately on selection, and only
  // the resulting URL is held in form state until Save actually PATCHes
  // the City row.
  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);

    const formData = new FormData();
    formData.append('photo', file);

    fetch(`${import.meta.env.VITE_API_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        return res.json();
      })
      .then((data) => setPhotoUrl(data.url))
      .catch((err) => {
        console.error('Failed to upload photo:', err);
        setPhotoError('Could not upload photo - check the server is running and try again.');
      })
      .finally(() => setUploadingPhoto(false));
  }

  function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    fetch(`${import.meta.env.VITE_API_URL}/api/cities/${cityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoUrl }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        return res.json();
      })
      .then((saved) => {
        updateCity(saved);
        navigate('/');
      })
      .catch((err) => {
        console.error('Failed to save city:', err);
        setError('Could not save - check the server is running and try again.');
      })
      .finally(() => setSaving(false));
  }

  return (
    <div className="city-editor">
      <div className="city-editor-header">
        <Link to="/" className="city-editor-back" aria-label="Cancel">
          &larr;
        </Link>
        <h1 className="city-editor-title">
          {city ? `Edit ${city.name}` : 'Edit city'}
        </h1>
      </div>

      {!city && <div className="city-editor-status">Couldn&apos;t find this city.</div>}

      {city && (
        <form className="city-editor-form" onSubmit={handleSave}>
          <div className="city-editor-field">
            <span className="city-editor-label">Cover photo (shown at the top of Home)</span>
            {photoUrl && (
              <img
                src={getCityPhotoUrl(photoUrl, { width: 400, height: 277 })}
                alt=""
                className="city-editor-photo-preview"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              disabled={uploadingPhoto}
            />
            {uploadingPhoto && <span className="city-editor-photo-status">Uploading…</span>}
            {photoUrl && !uploadingPhoto && (
              <button
                type="button"
                className="city-editor-photo-remove"
                onClick={() => setPhotoUrl('')}
              >
                Remove photo
              </button>
            )}
            {photoError && <div className="city-editor-error">{photoError}</div>}
          </div>

          {error && <div className="city-editor-error">{error}</div>}

          <div className="city-editor-actions">
            <Link to="/" className="city-editor-cancel">
              Cancel
            </Link>
            <button type="submit" className="city-editor-save" disabled={saving || uploadingPhoto}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default CityEditor;
