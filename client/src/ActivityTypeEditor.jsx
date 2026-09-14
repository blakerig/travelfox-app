import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import { useAuth } from './auth-context.js';
import { authHeaders } from './auth.js';
import './ActivityTypeEditor.css';

// Editor for an ActivityType (e.g. "Laser Tag", "Padel") itself - name,
// group, summary, description. Added 2026-09-14 alongside POST/PATCH
// /api/activity-types on the server, so creating or renaming a type no
// longer needs Prisma Studio - only adding/editing the *providers* within
// a type was in-app before this (see "+ Add provider" on
// ActivityTypeDetail.jsx, and EntryEditor.jsx, which this closely mirrors
// in structure).
//
// Handles both modes via the same route-param convention as EntryEditor.jsx:
//   /category/:slug/type/new/edit       - create (typeId === 'new'),
//                                          reached via "+ Add type" on
//                                          CategoryScreen.jsx
//   /category/:slug/type/:typeId/edit   - edit, reached via "Edit" on
//                                          ActivityTypeDetail.jsx
//
// Deliberately scoped to the same fields CategoryScreen.jsx/
// ActivityTypeDetail.jsx actually show (name, group, summary, description)
// - sortOrder stays Prisma-Studio-only, same as Entry.sortOrder never
// having grown a form field either (see EntryEditor.jsx's file comment).
// No city/category picker either - both are fixed from context, same
// reasoning as EntryEditor.jsx's create mode.
//
// Open to every team role, not just Editor/Admin (2026-09-14 decision) -
// unlike Entry, ActivityType has no draft/review status to catch a
// Creator's mistake behind, but this was a deliberate call rather than an
// oversight (see the matching comment on POST /api/activity-types in
// server/index.js). Revisit if that turns out to cause problems, e.g.
// near-duplicate types piling up - see claude/todo.md.
function ActivityTypeEditor() {
  const { slug, typeId } = useParams();
  const navigate = useNavigate();
  const isCreate = typeId === 'new';
  const { city, loading: cityLoading } = useCity();
  const { cityData, cityDataReady, activityGroups, ensureActivityGroups, upsertActivityType } =
    useCityData();
  const { isAuthenticated } = useAuth();

  const [activityType, setActivityType] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadedTypeId, setLoadedTypeId] = useState(null);
  // Tracks which typeId the form fields have actually been populated for -
  // same reason as EntryEditor.jsx's populatedEntryId (kept separate from
  // loadedTypeId so this effect can depend on cityData without
  // re-populating, and clobbering whatever you're mid-typing, every time
  // the cache changes for an unrelated reason).
  const [populatedTypeId, setPopulatedTypeId] = useState(null);

  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(''); // '' = no group, else the ActivityGroup id as a string
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [descTab, setDescTab] = useState('write'); // 'write' | 'preview'

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset to a loading state during render when we've navigated to a
  // different type (or into/out of create mode) - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (typeId !== loadedTypeId) {
    setLoadedTypeId(typeId);
    setActivityType(null);
    setNotFound(false);
    setError(null);
    setName('');
    setGroupId('');
    setSummary('');
    setDescription('');
    setDescTab('write');
  }

  // The Group dropdown needs every ActivityGroup that exists, not just the
  // ones already used by this city's types - see ensureActivityGroups in
  // CityDataProvider.jsx.
  useEffect(() => {
    ensureActivityGroups();
  }, [ensureActivityGroups]);

  // Edit mode: load the existing type's current values into the form -
  // cache first, falling back to a direct fetch only once the cache is
  // ready and still doesn't have this id (e.g. a bookmarked edit link for
  // a type belonging to a city other than whatever's currently selected).
  // Same convention as EntryEditor.jsx's load effect.
  useEffect(() => {
    if (isCreate || populatedTypeId === typeId) return;

    function populate(data) {
      setPopulatedTypeId(typeId);
      setActivityType(data);
      setName(data.name ?? '');
      setGroupId(data.groupId != null ? String(data.groupId) : '');
      setSummary(data.summary ?? '');
      setDescription(data.description ?? '');
    }

    const cached = cityData?.activityTypes.find((t) => String(t.id) === typeId);
    if (cached) {
      populate(cached);
      return;
    }
    if (!cityDataReady) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/activity-types/${typeId}`, {
      headers: authHeaders(),
    })
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
      .catch((err) => console.error('Failed to fetch activity type:', err));
  }, [isCreate, typeId, populatedTypeId, cityData, cityDataReady]);

  const ready = isCreate ? Boolean(city) : activityType != null;

  function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);

    const body = {
      name,
      summary,
      description,
      groupId: groupId === '' ? null : Number(groupId),
    };
    const request = isCreate
      ? fetch(`${import.meta.env.VITE_API_URL}/api/activity-types`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ ...body, cityId: city.id }),
        })
      : fetch(`${import.meta.env.VITE_API_URL}/api/activity-types/${typeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(body),
        });

    request
      .then((res) => {
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        return res.json();
      })
      .then((saved) => {
        // Patch the shared cache in place (see CityDataProvider.jsx) so
        // CategoryScreen/ActivityTypeDetail show this save immediately on
        // the very next screen.
        upsertActivityType(saved);
        navigate(`/category/${slug}/type/${saved.id}`);
      })
      .catch((err) => {
        console.error('Failed to save activity type:', err);
        setError('Could not save - check the server is running and try again.');
      })
      .finally(() => setSaving(false));
  }

  // Not just visually hidden - a logged-out visitor never sees this
  // screen's markup at all, whatever url they land on it with. Placed
  // after every hook above so hook-call order never changes between
  // renders. See claude/todo.md.
  if (!isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  const cancelTo = isCreate ? `/category/${slug}` : `/category/${slug}/type/${typeId}`;

  return (
    <div className="activity-type-editor">
      <div className="activity-type-editor-header">
        <Link to={cancelTo} className="activity-type-editor-back" aria-label="Cancel">
          &larr;
        </Link>
        <h1 className="activity-type-editor-title">
          {isCreate ? 'New activity type' : 'Edit activity type'}
        </h1>
      </div>

      {notFound && (
        <div className="activity-type-editor-status">Couldn&apos;t find this activity type.</div>
      )}
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

          <label className="activity-type-editor-field">
            <span className="activity-type-editor-label">
              Group (optional - the Sport &amp; Active / Culture &amp; Arts / Outdoors &amp;
              Nature / Fun &amp; Entertainment filter chips on the Activities screen)
            </span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="activity-type-editor-select"
            >
              <option value="">None</option>
              {(activityGroups ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="activity-type-editor-field">
            <span className="activity-type-editor-label">
              Summary (optional - short fallback shown only when there&apos;s no description
              below)
            </span>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="activity-type-editor-input"
            />
          </label>

          <div className="activity-type-editor-field">
            <div className="activity-type-editor-desc-header">
              <span className="activity-type-editor-label">Description (Markdown)</span>
              <div className="activity-type-editor-tabs">
                <button
                  type="button"
                  className={
                    descTab === 'write'
                      ? 'activity-type-editor-tab is-active'
                      : 'activity-type-editor-tab'
                  }
                  onClick={() => setDescTab('write')}
                >
                  Write
                </button>
                <button
                  type="button"
                  className={
                    descTab === 'preview'
                      ? 'activity-type-editor-tab is-active'
                      : 'activity-type-editor-tab'
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
                placeholder={'# Heading\n\n**bold** *italic*\n\n- bullet one\n- bullet two'}
              />
            ) : (
              <div className="activity-type-editor-preview">
                {description ? (
                  <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                    {description}
                  </ReactMarkdown>
                ) : (
                  <span className="activity-type-editor-preview-empty">
                    Nothing to preview yet.
                  </span>
                )}
              </div>
            )}
            <p className="activity-type-editor-hint">
              Shown above the provider list on this type&apos;s screen - what the activity
              actually is, e.g. explaining Padel to someone who&apos;s never heard of it. Also
              what shows when there are no providers yet.
            </p>
          </div>

          {error && <div className="activity-type-editor-error">{error}</div>}

          <div className="activity-type-editor-actions">
            <Link to={cancelTo} className="activity-type-editor-cancel">
              Cancel
            </Link>
            <button type="submit" className="activity-type-editor-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default ActivityTypeEditor;
