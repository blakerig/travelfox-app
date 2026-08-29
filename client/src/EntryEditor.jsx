import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import { useCity } from './city-context.js';
import './EntryEditor.css';

// Text-only editor for an entry: name, summary, type, description. Handles both
// editing an existing entry (/category/:slug/entry/:entryId/edit) and
// creating a new one (/category/:slug/entry/new/edit - entryId === 'new',
// reached via "+ Add" on CategoryScreen). Same form either way; creation
// only differs in where city/category come from (current context, rather
// than the loaded entry) and whether Save does a POST or a PATCH. The new
// entry isn't created until Save is actually pressed - there's no separate
// "blank draft" step that could leave a half-empty stub row behind if the
// user backs out.
//
// Deliberately scoped to just these four String fields for now, matching
// the server's PATCH/POST endpoints - editing/setting location/price/rating
// still goes through Prisma Studio. This is a plain field-by-field form on
// purpose (no generic form-schema abstraction yet); when the scope grows to
// a full editor (city/category pickers, location, price, rating), that's
// the point to reach for a form library rather than continuing to hand-roll
// individual useState fields.
function EntryEditor() {
  const { slug, entryId } = useParams();
  const navigate = useNavigate();
  const isCreate = entryId === 'new';
  const { city, loading: cityLoading } = useCity();

  // Create mode only, and only reached from ActivityTypeDetail's "+ Add
  // provider" link (?activityTypeId=<id> in the URL) - links this new
  // provider Entry to its ActivityType automatically, the same way
  // city/category are already resolved from context rather than being form
  // fields. Undefined for every other "+ Add" entry point, so entries
  // outside Activities are unaffected.
  const [searchParams] = useSearchParams();
  const activityTypeId = searchParams.get('activityTypeId');

  const [entry, setEntry] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadedEntryId, setLoadedEntryId] = useState(null);

  // Create mode only: the category this new entry belongs to, resolved from
  // the :slug in the URL (city comes from CityProvider instead).
  const [categoryId, setCategoryId] = useState(null);
  const [categoryError, setCategoryError] = useState(false);

  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [descTab, setDescTab] = useState('write'); // 'write' | 'preview'
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset to a loading state during render when we've navigated to a
  // different entry (or into/out of create mode), rather than synchronously
  // inside an effect - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (entryId !== loadedEntryId) {
    setLoadedEntryId(entryId);
    setEntry(null);
    setNotFound(false);
    setCategoryId(null);
    setCategoryError(false);
    setError(null);
    setName('');
    setSummary('');
    setType('');
    setDescription('');
    setDescTab('write');
    setPhotoUrl('');
    setPhotoError(null);
  }

  // Edit mode: load the existing entry's current values.
  useEffect(() => {
    if (isCreate) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/entries/${entryId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setEntry(data);
        setName(data.name ?? '');
        setSummary(data.summary ?? '');
        setType(data.type ?? '');
        setDescription(data.description ?? '');
        setPhotoUrl(data.photoUrl ?? '');
      })
      .catch((err) => console.error('Failed to fetch entry:', err));
  }, [isCreate, entryId]);

  // Create mode: resolve the category id matching :slug.
  useEffect(() => {
    if (!isCreate) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/categories`)
      .then((res) => res.json())
      .then((cats) => {
        const match = cats.find((c) => c.slug === slug);
        if (!match) {
          setCategoryError(true);
          return;
        }
        setCategoryId(match.id);
      })
      .catch((err) => console.error('Failed to fetch categories:', err));
  }, [isCreate, slug]);

  const ready = isCreate ? Boolean(city) && categoryId != null : entry != null;

  // Uploads the selected file to the server's /api/upload endpoint (which
  // forwards it to Cloudinary - see server/index.js) and stores the URL it
  // returns. The entry itself is only saved as a normal string field when
  // Save is pressed, same as every other field on this form - the upload
  // happens immediately on file selection so the preview can update, but
  // nothing is written to the Entry row until Save.
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
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);

    const request = isCreate
      ? fetch(`${import.meta.env.VITE_API_URL}/api/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cityId: city.id,
            categoryId,
            name,
            summary,
            type,
            description,
            photoUrl,
            activityTypeId,
          }),
        })
      : fetch(`${import.meta.env.VITE_API_URL}/api/entries/${entryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, summary, type, description, photoUrl }),
        });

    request
      .then((res) => {
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        return res.json();
      })
      .then((saved) => {
        navigate(`/category/${slug}/entry/${saved.id}`);
      })
      .catch((err) => {
        console.error('Failed to save entry:', err);
        setError('Could not save - check the server is running and try again.');
      })
      .finally(() => setSaving(false));
  }

  const cancelTo = isCreate
    ? activityTypeId
      ? `/category/${slug}/type/${activityTypeId}`
      : `/category/${slug}`
    : `/category/${slug}/entry/${entryId}`;

  return (
    <div className="entry-editor">
      <div className="entry-editor-header">
        <Link to={cancelTo} className="entry-editor-back" aria-label="Cancel">
          &larr;
        </Link>
        <h1 className="entry-editor-title">{isCreate ? 'New entry' : 'Edit entry'}</h1>
      </div>

      {notFound && <div className="entry-editor-status">Couldn&apos;t find this entry.</div>}
      {categoryError && (
        <div className="entry-editor-status">
          Couldn&apos;t find the &quot;{slug}&quot; category.
        </div>
      )}
      {!notFound && !categoryError && (cityLoading || !ready) && (
        <div className="entry-editor-status">Loading…</div>
      )}

      {ready && (
        <form className="entry-editor-form" onSubmit={handleSave}>
          <label className="entry-editor-field">
            <span className="entry-editor-label">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="entry-editor-input"
              autoFocus={isCreate}
            />
          </label>

          <label className="entry-editor-field">
            <span className="entry-editor-label">Summary (optional - shown on the card)</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="entry-editor-textarea entry-editor-textarea-short"
              rows={2}
            />
          </label>

          <label className="entry-editor-field">
            <span className="entry-editor-label">
              Type (optional - shown on the card, e.g. cuisine for restaurants or a place type
              like &quot;Museum&quot; for sightseeing)
            </span>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="entry-editor-input"
            />
          </label>

          <div className="entry-editor-field">
            <span className="entry-editor-label">Photo (optional - shown on the card)</span>
            {photoUrl && (
              <img
                src={getEntryPhotoUrl(photoUrl, { width: 400, height: 300 })}
                alt=""
                className="entry-editor-photo-preview"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              disabled={uploadingPhoto}
            />
            {uploadingPhoto && <span className="entry-editor-photo-status">Uploading…</span>}
            {photoUrl && !uploadingPhoto && (
              <button
                type="button"
                className="entry-editor-photo-remove"
                onClick={() => setPhotoUrl('')}
              >
                Remove photo
              </button>
            )}
            {photoError && <div className="entry-editor-error">{photoError}</div>}
          </div>

          <div className="entry-editor-field">
            <div className="entry-editor-desc-header">
              <span className="entry-editor-label">Description (Markdown)</span>
              <div className="entry-editor-tabs">
                <button
                  type="button"
                  className={descTab === 'write' ? 'entry-editor-tab is-active' : 'entry-editor-tab'}
                  onClick={() => setDescTab('write')}
                >
                  Write
                </button>
                <button
                  type="button"
                  className={descTab === 'preview' ? 'entry-editor-tab is-active' : 'entry-editor-tab'}
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
                className="entry-editor-textarea entry-editor-textarea-long"
                rows={10}
                placeholder={'# Heading\n\n**bold** *italic*\n\n- bullet one\n- bullet two'}
              />
            ) : (
              <div className="entry-editor-preview">
                {description ? (
                  <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                    {description}
                  </ReactMarkdown>
                ) : (
                  <span className="entry-editor-preview-empty">Nothing to preview yet.</span>
                )}
              </div>
            )}
            <p className="entry-editor-hint">
              One Enter starts a new line, a blank line starts a new paragraph. Use **bold**,
              *italic*, # headings, and - bullets.
            </p>
          </div>

          {error && <div className="entry-editor-error">{error}</div>}

          <div className="entry-editor-actions">
            <Link to={cancelTo} className="entry-editor-cancel">
              Cancel
            </Link>
            <button type="submit" className="entry-editor-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default EntryEditor;
