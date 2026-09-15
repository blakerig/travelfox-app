import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import { useAuth } from './auth-context.js';
import { authHeaders } from './auth.js';
import './ShopTypeEditor.css';

// Editor for a ShopType (e.g. "Local Markets", "Souvenirs") itself - name,
// summary, description. A near-exact mirror of ActivityTypeEditor.jsx,
// minus the Group field - Shopping has no ActivityGroup equivalent (see
// ShopType in schema.prisma) so there's no dropdown to show and no groupId
// to save. Kept as its own file rather than a config-driven shared
// component for the same reason given in ShopTypeDetail.jsx's file comment.
//
// Handles both modes via the same route-param convention as
// ActivityTypeEditor.jsx/EntryEditor.jsx:
//   /category/:slug/type/new/edit       - create (typeId === 'new'),
//                                          reached via "+ Add type" on
//                                          CategoryScreen.jsx
//   /category/:slug/type/:typeId/edit   - edit, reached via "Edit" on
//                                          ShopTypeDetail.jsx
//
// Deliberately scoped to the same fields CategoryScreen.jsx/
// ShopTypeDetail.jsx actually show (name, summary, description) - sortOrder
// stays Prisma-Studio-only, same as ActivityType/Entry.sortOrder never
// having grown a form field either. No city/category picker either - both
// are fixed from context, same reasoning as EntryEditor.jsx's create mode.
//
// Open to every team role, not just Editor/Admin - same reasoning as
// ActivityTypeEditor.jsx (no draft/review status to catch a Creator's
// mistake behind either way, see the matching comment on
// POST /api/shop-types in server/index.js).
function ShopTypeEditor() {
  const { slug, typeId } = useParams();
  const navigate = useNavigate();
  const isCreate = typeId === 'new';
  const { city, loading: cityLoading } = useCity();
  const { cityData, cityDataReady, upsertShopType } = useCityData();
  const { isAuthenticated } = useAuth();

  const [shopType, setShopType] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadedTypeId, setLoadedTypeId] = useState(null);
  // Tracks which typeId the form fields have actually been populated for -
  // same reason as EntryEditor.jsx's populatedEntryId (kept separate from
  // loadedTypeId so this effect can depend on cityData without
  // re-populating, and clobbering whatever you're mid-typing, every time
  // the cache changes for an unrelated reason).
  const [populatedTypeId, setPopulatedTypeId] = useState(null);

  const [name, setName] = useState('');
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
    setShopType(null);
    setNotFound(false);
    setError(null);
    setName('');
    setSummary('');
    setDescription('');
    setDescTab('write');
  }

  // Edit mode: load the existing type's current values into the form -
  // cache first, falling back to a direct fetch only once the cache is
  // ready and still doesn't have this id (e.g. a bookmarked edit link for a
  // type belonging to a city other than whatever's currently selected).
  // Same convention, and the same effect, as ActivityTypeEditor.jsx's load
  // effect - just without that file's separate ensureActivityGroups() call
  // above it, since ShopType has no Group dropdown to populate.
  useEffect(() => {
    if (isCreate || populatedTypeId === typeId) return;

    function populate(data) {
      setPopulatedTypeId(typeId);
      setShopType(data);
      setName(data.name ?? '');
      setSummary(data.summary ?? '');
      setDescription(data.description ?? '');
    }

    const cached = cityData?.shopTypes.find((t) => String(t.id) === typeId);
    if (cached) {
      populate(cached);
      return;
    }
    if (!cityDataReady) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/shop-types/${typeId}`, {
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
      .catch((err) => console.error('Failed to fetch shop type:', err));
  }, [isCreate, typeId, populatedTypeId, cityData, cityDataReady]);

  const ready = isCreate ? Boolean(city) : shopType != null;

  function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);

    const body = { name, summary, description };
    const request = isCreate
      ? fetch(`${import.meta.env.VITE_API_URL}/api/shop-types`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ ...body, cityId: city.id }),
        })
      : fetch(`${import.meta.env.VITE_API_URL}/api/shop-types/${typeId}`, {
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
        // CategoryScreen/ShopTypeDetail show this save immediately on the
        // very next screen.
        upsertShopType(saved);
        navigate(`/category/${slug}/type/${saved.id}`);
      })
      .catch((err) => {
        console.error('Failed to save shop type:', err);
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
    <div className="shop-type-editor">
      <div className="shop-type-editor-header">
        <Link to={cancelTo} className="shop-type-editor-back" aria-label="Cancel">
          &larr;
        </Link>
        <h1 className="shop-type-editor-title">
          {isCreate ? 'New shop type' : 'Edit shop type'}
        </h1>
      </div>

      {notFound && (
        <div className="shop-type-editor-status">Couldn&apos;t find this shop type.</div>
      )}
      {!notFound && (cityLoading || !ready) && (
        <div className="shop-type-editor-status">Loading…</div>
      )}

      {ready && (
        <form className="shop-type-editor-form" onSubmit={handleSave}>
          <label className="shop-type-editor-field">
            <span className="shop-type-editor-label">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="shop-type-editor-input"
              autoFocus={isCreate}
            />
          </label>

          <label className="shop-type-editor-field">
            <span className="shop-type-editor-label">
              Summary (optional - short fallback shown only when there&apos;s no description
              below)
            </span>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="shop-type-editor-input"
            />
          </label>

          <div className="shop-type-editor-field">
            <div className="shop-type-editor-desc-header">
              <span className="shop-type-editor-label">Description (Markdown)</span>
              <div className="shop-type-editor-tabs">
                <button
                  type="button"
                  className={
                    descTab === 'write' ? 'shop-type-editor-tab is-active' : 'shop-type-editor-tab'
                  }
                  onClick={() => setDescTab('write')}
                >
                  Write
                </button>
                <button
                  type="button"
                  className={
                    descTab === 'preview'
                      ? 'shop-type-editor-tab is-active'
                      : 'shop-type-editor-tab'
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
                className="shop-type-editor-textarea"
                rows={8}
                placeholder={'# Heading\n\n**bold** *italic*\n\n- bullet one\n- bullet two'}
              />
            ) : (
              <div className="shop-type-editor-preview">
                {description ? (
                  <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                    {description}
                  </ReactMarkdown>
                ) : (
                  <span className="shop-type-editor-preview-empty">Nothing to preview yet.</span>
                )}
              </div>
            )}
            <p className="shop-type-editor-hint">
              Shown above the provider list on this type&apos;s screen - what the shop type
              actually is, e.g. explaining what counts as a "Local Market" here. Also what shows
              when there are no providers yet.
            </p>
          </div>

          {error && <div className="shop-type-editor-error">{error}</div>}

          <div className="shop-type-editor-actions">
            <Link to={cancelTo} className="shop-type-editor-cancel">
              Cancel
            </Link>
            <button type="submit" className="shop-type-editor-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default ShopTypeEditor;
