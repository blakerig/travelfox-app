import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import './EntryEditor.css';

// Text-only editor for an entry: name, summary, types, phone, website,
// opening times, description, notes (plus a photo upload). Handles both
// editing an existing entry (/category/:slug/entry/:entryId/edit) and
// creating a new one (/category/:slug/entry/new/edit - entryId === 'new',
// reached via "+ Add" on CategoryScreen). Same form either way; creation
// only differs in where city/category come from (current context, rather
// than the loaded entry) and whether Save does a POST or a PATCH. The new
// entry isn't created until Save is actually pressed - there's no separate
// "blank draft" step that could leave a half-empty stub row behind if the
// user backs out.
//
// Deliberately scoped to text/string fields only, matching the server's
// PATCH/POST endpoints - editing/setting location/price/rating still goes
// through Prisma Studio. This is a plain field-by-field form on purpose (no
// generic form-schema abstraction yet); when the scope grows to a full
// editor (city/category pickers, location, price, rating), that's the point
// to reach for a form library rather than continuing to hand-roll
// individual useState fields.
// Splits the comma-separated types field into a clean array for the API:
// trims whitespace around each value, drops empty entries (a trailing
// comma, or the field left blank), but doesn't dedupe or otherwise
// normalize casing/spelling - see the Entry.types comment in schema.prisma
// for why that's a deliberate limitation of the free-text approach, not an
// oversight.
function parseTypesInput(input) {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function EntryEditor() {
  const { slug, entryId } = useParams();
  const navigate = useNavigate();
  const isCreate = entryId === 'new';
  const { city, loading: cityLoading } = useCity();
  const { cityData, cityDataReady, ensureCategories, upsertEntry } = useCityData();

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
  // Tracks which entryId the form fields have actually been populated
  // for - see the edit-mode load effect below. Separate from
  // loadedEntryId (which drives the render-time reset block just below
  // this) so that effect can safely depend on cityData without
  // re-populating (and clobbering whatever you're mid-typing) every
  // time the cache changes for a reason unrelated to this entry.
  const [populatedEntryId, setPopulatedEntryId] = useState(null);

  // Create mode only: the category this new entry belongs to, resolved from
  // the :slug in the URL (city comes from CityProvider instead).
  const [categoryId, setCategoryId] = useState(null);
  const [categoryError, setCategoryError] = useState(false);

  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  // Held as a plain comma-separated string while editing (e.g. "Tapas,
  // Catalan"), not an array - simplest possible UI for a field that can now
  // hold more than one value (2026-08-30, see schema.prisma's Entry.types),
  // consistent with this form staying a plain hand-rolled text input rather
  // than a proper multi-select/tag picker. Parsed into an array only at
  // save time (parseTypesInput below); loaded back by joining the existing
  // array with ", " (see the fetch effect below).
  const [typesInput, setTypesInput] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [openingTimes, setOpeningTimes] = useState('');
  const [description, setDescription] = useState('');
  const [descTab, setDescTab] = useState('write'); // 'write' | 'preview'
  // Internal-only - see Entry.notes in schema.prisma. Never read by any
  // user-facing screen, only shown here at the bottom of the form.
  const [notes, setNotes] = useState('');
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
    setTypesInput('');
    setPhone('');
    setWebsite('');
    setOpeningTimes('');
    setDescription('');
    setDescTab('write');
    setNotes('');
    setPhotoUrl('');
    setPhotoError(null);
  }

  // Edit mode: load the existing entry's current values into the form -
  // from the shared per-city cache first (see CityDataProvider.jsx),
  // falling back to a direct fetch only once that cache is ready and still
  // doesn't have this id (e.g. a bookmarked edit link for an entry
  // belonging to a city other than whatever's currently selected). Only
  // ever populates the form once per entryId (see populatedEntryId above)
  // - deliberately does NOT re-run every time cityData changes afterwards
  // (a background revalidation, or this exact save patching the cache via
  // upsertEntry below), which would otherwise silently overwrite whatever
  // you're still typing.
  useEffect(() => {
    if (isCreate || populatedEntryId === entryId) return;

    function populate(data) {
      setPopulatedEntryId(entryId);
      setEntry(data);
      setName(data.name ?? '');
      setSummary(data.summary ?? '');
      setTypesInput((data.types ?? []).join(', '));
      setPhone(data.phone ?? '');
      setWebsite(data.website ?? '');
      setOpeningTimes(data.openingTimes ?? '');
      setDescription(data.description ?? '');
      setNotes(data.notes ?? '');
      setPhotoUrl(data.photoUrl ?? '');
    }

    const cached = cityData?.entries.find((e) => String(e.id) === entryId);
    if (cached) {
      populate(cached);
      return;
    }
    if (!cityDataReady) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/entries/${entryId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) populate(data);
      })
      .catch((err) => console.error('Failed to fetch entry:', err));
  }, [isCreate, entryId, populatedEntryId, cityData, cityDataReady]);

  // Create mode: resolve the category id matching :slug - via the shared,
  // fetched-once category list (see CityDataProvider.jsx's
  // ensureCategories) instead of re-fetching /api/categories every time the
  // "+ Add" form opens.
  useEffect(() => {
    if (!isCreate) return;
    ensureCategories().then((cats) => {
      const match = cats.find((c) => c.slug === slug);
      if (!match) {
        setCategoryError(true);
        return;
      }
      setCategoryId(match.id);
    });
  }, [isCreate, slug, ensureCategories]);

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
            types: parseTypesInput(typesInput),
            phone,
            website,
            openingTimes,
            description,
            photoUrl,
            notes,
            activityTypeId,
          }),
        })
      : fetch(`${import.meta.env.VITE_API_URL}/api/entries/${entryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            summary,
            types: parseTypesInput(typesInput),
            phone,
            website,
            openingTimes,
            description,
            photoUrl,
            notes,
          }),
        });

    request
      .then((res) => {
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        return res.json();
      })
      .then((saved) => {
        // Patch the shared cache in place (see CityDataProvider.jsx) so
        // EntryDetail/CategoryScreen show this save immediately on the
        // very next screen, instead of still holding whatever was cached
        // before it.
        upsertEntry(saved);
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
              like &quot;Museum&quot; for sightseeing. Separate more than one with a comma, e.g.
              &quot;Pinchos, Catalan&quot;)
            </span>
            <input
              type="text"
              value={typesInput}
              onChange={(e) => setTypesInput(e.target.value)}
              className="entry-editor-input"
              placeholder="e.g. Tapas, Catalan"
            />
          </label>

          <label className="entry-editor-field">
            <span className="entry-editor-label">
              Phone (optional - shown on the card, tap-to-call on the detail screen)
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="entry-editor-input"
              placeholder="e.g. +34 933 123 456"
            />
          </label>

          <label className="entry-editor-field">
            <span className="entry-editor-label">Website (optional)</span>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="entry-editor-input"
              placeholder="e.g. https://restaurant.com"
            />
          </label>

          <label className="entry-editor-field">
            <span className="entry-editor-label">
              Opening times (optional - free text, e.g. &quot;Mon: 7.30pm to
              11.30pm, Tue-Sat: 1pm to 3.45pm &amp; 7.30pm to 11.30pm&quot; -
              commas separate day-range clauses, &quot;&amp;&quot; separates
              multiple windows in one clause, minutes use a period like
              7.30pm)
            </span>
            <textarea
              value={openingTimes}
              onChange={(e) => setOpeningTimes(e.target.value)}
              className="entry-editor-textarea entry-editor-textarea-short"
              rows={2}
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

          <label className="entry-editor-field">
            <span className="entry-editor-label">
              Notes (optional - for us only, never shown in the app. Ideas, things to
              check, drafts to fold into the description later)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="entry-editor-textarea entry-editor-textarea-short"
              rows={3}
            />
          </label>

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
