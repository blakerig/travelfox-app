import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import { geocodeAddress } from './geocode.js';
import { fetchOsmOpeningHours } from './osmOpeningHours.js';
import { ESSENTIALS_ICON_OPTIONS } from './essentialsIcons.jsx';
import { useCity } from './city-context.js';
import { useCityData } from './city-data-context.js';
import { useAuth } from './auth-context.js';
import { authHeaders } from './auth.js';
import './EntryEditor.css';

// Text-only editor for an entry: name, summary, types, phone, website,
// opening times, price (priceInfo or priceLevel, see below), description,
// notes (plus a photo upload). Handles both
// editing an existing entry (/category/:slug/entry/:entryId/edit) and
// creating a new one (/category/:slug/entry/new/edit - entryId === 'new',
// reached via "+ Add" on CategoryScreen). Same form either way; creation
// only differs in where city/category come from (current context, rather
// than the loaded entry) and whether Save does a POST or a PATCH. The new
// entry isn't created until Save is actually pressed - there's no separate
// "blank draft" step that could leave a half-empty stub row behind if the
// user backs out.
//
// Essentials hides the venue-shaped fields (2026-09-13) - Type, Phone,
// Website, Address, Coordinates, Opening times, Price - since Essentials
// entries (airport, language, money, etc.) are reference content, not
// venues, and these fields never made sense to fill in for them. They're
// still fully supported server-side (unaffected for every other category);
// this is purely a client-side display decision, gated on isEssentials
// below, not a schema/API change. If an Essentials entry already has values
// in any of these fields (e.g. from before this change), they're simply not
// editable here anymore rather than being cleared - Save only ever sends
// the fields this form actually shows plus whatever state each hidden
// field's useState already held, so a hidden field's last-loaded value is
// preserved on save, not blanked out.
//
// Deliberately scoped to text/string fields only, matching the server's
// PATCH/POST endpoints - editing/setting rating still goes through Prisma
// Studio (see Entry.rating in schema.prisma), same for city/category on an
// existing entry. This is a plain field-by-field form on purpose (no
// generic form-schema abstraction yet); when the scope grows to cover
// city/category pickers or rating, that's the point to reach for a form
// library rather than continuing to hand-roll individual useState fields.
//
// priceLevel (2026-09-15) is Eating Out's own price field - a 1-4 $/$$/$$/
// $$$$ tier (see Entry.priceLevel in schema.prisma), rendered as a <select>
// rather than a free number input so it's impossible to save anything
// outside that range by mistake (no "5" or "2.5" to catch on review) and so
// the options read the same way the resulting $/$$/$$$/$$$$ chips do
// elsewhere in the app (CategoryScreen.jsx's distance-filter panel,
// EntryCard.jsx). It replaces priceInfo for this one category rather than
// sitting alongside it - Eating Out was never actually using priceInfo's
// free-text headline price (that field exists for Sightseeing admission,
// which doesn't fit a $/$$/$$/$$$$ scale - see priceInfo's own doc comment
// below) - so showing both would just be confusing about which one a
// restaurant's card/filter chips actually read from (priceLevel, always,
// per cardShowPrice/filterOptions in categoryConfig.js). Every other
// category keeps priceInfo exactly as before; isEatingOut/isEssentials are
// mutually exclusive by slug, so this never has to consider both at once.
// See the isEatingOut-gated fields below for where this and priceInfo
// actually diverge.
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
  // Gates the venue-only fields below (Type/Phone/Website/Address/
  // Coordinates/Opening times/Price) - see the file comment above.
  const isEssentials = slug === 'essentials';
  // Gates which price field renders below - priceLevel (a $/$$/$$/$$$$
  // select) for Eating Out, priceInfo (free text) for every other
  // non-Essentials category - see the priceLevel doc comment above.
  const isEatingOut = slug === 'eating-out';
  const { city, loading: cityLoading } = useCity();
  const { cityData, cityDataReady, ensureCategories, upsertEntry } = useCityData();
  const { user, isAuthenticated } = useAuth();
  const canPublish = isAuthenticated && (user.role === 'EDITOR' || user.role === 'ADMIN');
  // Labels the priceLevel select's options below ($/$$/$$/$$$$) - same
  // fallback and source (City.country.currencySymbol) as CategoryScreen.jsx
  // uses for its own $/$$/$$/$$$$ filter chips, so the two stay consistent.
  const currencySymbol = city?.country?.currencySymbol || '$';

  // Create mode only, and only reached from ActivityTypeDetail's/
  // ShopTypeDetail's "+ Add provider" link (?activityTypeId=<id> or
  // ?shopTypeId=<id> in the URL, per categoryConfig.js's typeIdParam) -
  // links this new provider Entry to its type automatically, the same way
  // city/category are already resolved from context rather than being form
  // fields. Both are undefined for every other "+ Add" entry point, so
  // entries outside Activities/Shopping are unaffected. Reading both by
  // name rather than a single generic `searchParams.get(config.typeIdParam)`
  // keeps this working even for a category with no typeIdParam configured
  // at all (get() on an absent param name is just undefined either way, but
  // being explicit here means a typo in categoryConfig.js can't silently
  // stop this from working for either category).
  const [searchParams] = useSearchParams();
  const activityTypeId = searchParams.get('activityTypeId');
  const shopTypeId = searchParams.get('shopTypeId');
  // Whichever of the two is present for this entry point (at most one ever
  // is) - used below for the POST body and the "cancel" back-link.
  const groupedTypeId = activityTypeId ?? shopTypeId;

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
  // categoryError: the categories list loaded fine but this slug genuinely
  // isn't in it (a real data problem - wrong/renamed slug in the URL).
  // categoryLoadError: the categories fetch itself failed (network blip,
  // server waking up, etc.) - see the "Fixed 2026-09-20" note on
  // ensureCategories in CityDataProvider.jsx. Kept as two separate states
  // rather than one, since they mean different things and need different
  // messages/actions (one is "this is broken", the other is "try again").
  const [categoryError, setCategoryError] = useState(false);
  const [categoryLoadError, setCategoryLoadError] = useState(false);

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
  // See Entry.priceInfo in schema.prisma - deliberately a short
  // "headline" price, not a full tariff table (see this field's hint
  // text below for the same guidance surfaced to whoever's typing).
  const [priceInfo, setPriceInfo] = useState('');
  // Eating Out only - see Entry.priceLevel in schema.prisma and the
  // isEatingOut doc comment above. Held as a string ('', '1'..'4') matching
  // a <select>'s value, same convention as latitude/longitude below;
  // parsed to a number (or null) only at save time.
  const [priceLevel, setPriceLevel] = useState('');
  const [description, setDescription] = useState('');
  const [descTab, setDescTab] = useState('write'); // 'write' | 'preview'
  // Internal-only - see Entry.notes in schema.prisma. Never read by any
  // user-facing screen, only shown here at the bottom of the form.
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  // Essentials-only card icon (2026-09-19) - a short key into
  // ESSENTIALS_ICON_OPTIONS (essentialsIcons.jsx), e.g. "airport", or ''
  // for "no icon picked yet" (EntryCard.jsx falls back to a default pin
  // icon in that case, same as any other unset optional field). See the
  // picker UI below and the isEssentials doc comment near the top of
  // this file.
  const [icon, setIcon] = useState('');

  // Address/coordinates (2026-09-05) - the first location-ish fields
  // exposed in this editor; latitude/longitude used to be Prisma-Studio-
  // only (see the file comment at the top). Kept as plain strings while
  // editing, same convention as every other field here, parsed at save
  // time. geocodeStatus/geocodeSuggestion drive the lookup UI below -
  // 'idle' | 'loading' | 'auto-filled' | 'suggestion' | 'not-found' |
  // 'error'. geocodeSuggestion only holds a value in the 'suggestion'
  // state (see handleAddressLookup - coordinates that already had a value
  // before a lookup are never overwritten silently, so a fresh result
  // shows as an accept/dismiss suggestion instead of replacing them).
  // Publish workflow (2026-09-08) - see EntryStatus in schema.prisma.
  // Creators can only ever save as Draft/Awaiting Review; the Published
  // option only renders for editor/admin roles (canPublish above), and the
  // server rejects it from a creator regardless of what the client sends.
  const [status, setStatus] = useState('DRAFT');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [geocodeStatus, setGeocodeStatus] = useState('idle');
  const [geocodeSuggestion, setGeocodeSuggestion] = useState(null);

  // Opening-hours lookup (2026-09-26) - see "Structured opening hours" in
  // claude/todo.md and GET /api/opening-hours-lookup in server/index.js
  // (OpenStreetMap's Overpass API, not Google Places - see that endpoint's
  // comment for why). 'idle' | 'loading' | 'suggestion' | 'raw-only' |
  // 'not-found' | 'error'. hoursLookupSuggestion holds { name, converted }
  // in the 'suggestion' state or { name, raw } in the 'raw-only' state
  // (OSM had hours but this app couldn't confidently translate them into
  // its own convention - see convertOsmOpeningHours in osmOpeningHours.js).
  // Unlike the coordinates suggestion above, this is never auto-filled
  // even when openingTimes starts out empty - a name-matched OSM result is
  // a good guess, not a verified one the way a geocode hit is, so it
  // always needs an explicit "Use this" tap.
  const [hoursLookupStatus, setHoursLookupStatus] = useState('idle');
  const [hoursLookupSuggestion, setHoursLookupSuggestion] = useState(null);

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
    setCategoryLoadError(false);
    setError(null);
    setName('');
    setSummary('');
    setTypesInput('');
    setPhone('');
    setWebsite('');
    setOpeningTimes('');
    setPriceInfo('');
    setPriceLevel('');
    setDescription('');
    setDescTab('write');
    setNotes('');
    setStatus('DRAFT');
    setPhotoUrl('');
    setPhotoError(null);
    setIcon('');
    setAddress('');
    setLatitude('');
    setLongitude('');
    setGeocodeStatus('idle');
    setGeocodeSuggestion(null);
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
      setPriceInfo(data.priceInfo ?? '');
      setPriceLevel(data.priceLevel != null ? String(data.priceLevel) : '');
      setDescription(data.description ?? '');
      setNotes(data.notes ?? '');
      setStatus(data.status ?? 'DRAFT');
      setPhotoUrl(data.photoUrl ?? '');
      setIcon(data.icon ?? '');
      setAddress(data.address ?? '');
      setLatitude(data.latitude != null ? String(data.latitude) : '');
      setLongitude(data.longitude != null ? String(data.longitude) : '');
      setGeocodeStatus('idle');
      setGeocodeSuggestion(null);
    }

    const cached = cityData?.entries.find((e) => String(e.id) === entryId);
    if (cached) {
      populate(cached);
      return;
    }
    if (!cityDataReady) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/entries/${entryId}`, { headers: authHeaders() })
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
  //
  // Fixed 2026-09-20: pulled out of the effect below (and given a
  // categoryLoadError/categoryError split - see those states' doc comment
  // above) so a failed fetch - most likely a cold Render free-tier instance
  // waking up, see claude/services-and-costs.md - can be retried in place
  // via the button rendered below, instead of only ever showing a
  // permanent-looking "category not found" message that wasn't actually
  // true. ensureCategories() itself doesn't cache a failure (see its own
  // "Fixed 2026-09-20" comment), so calling this again genuinely re-fetches.
  const loadCategory = useCallback(() => {
    setCategoryError(false);
    setCategoryLoadError(false);
    ensureCategories()
      .then((cats) => {
        const match = cats.find((c) => c.slug === slug);
        if (!match) {
          setCategoryError(true);
          return;
        }
        setCategoryId(match.id);
      })
      .catch(() => {
        setCategoryLoadError(true);
      });
  }, [ensureCategories, slug]);

  useEffect(() => {
    if (!isCreate) return;
    loadCategory();
  }, [isCreate, loadCategory]);

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
      headers: authHeaders(),
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

  // Looks up latitude/longitude for the current address via GET
  // /api/geocode (OpenStreetMap's Nominatim, proxied server-side - see
  // that endpoint's comment in server/index.js). Combines name + address +
  // city in the query rather than address alone - Nominatim often indexes
  // named businesses directly, which tends to land on the actual building
  // rather than interpolating along the street the way a bare address
  // lookup can (see the "Suggested approach" note in claude/todo.md).
  //
  // Never silently overwrites coordinates that already have a value -
  // those might already be hand-verified (or looked up and checked once
  // already), so a fresh result there becomes a dismissable suggestion
  // instead (see the JSX below) rather than replacing them outright. Only
  // auto-fills directly when the fields were empty to begin with, i.e.
  // there was nothing to lose.
  function handleAddressLookup() {
    if (!address.trim()) return;
    const query = [name, address, city?.name].filter((part) => part && part.trim()).join(', ');
    const hadCoords = latitude.trim() !== '' || longitude.trim() !== '';

    setGeocodeStatus('loading');
    setGeocodeSuggestion(null);

    geocodeAddress(import.meta.env.VITE_API_URL, query)
      .then((result) => {
        if (!result) {
          setGeocodeStatus('not-found');
          return;
        }
        if (hadCoords) {
          setGeocodeSuggestion(result);
          setGeocodeStatus('suggestion');
        } else {
          setLatitude(String(result.latitude));
          setLongitude(String(result.longitude));
          setGeocodeStatus('auto-filled');
        }
      })
      .catch((err) => {
        console.error('Geocoding lookup failed:', err);
        setGeocodeStatus('error');
      });
  }

  function acceptGeocodeSuggestion() {
    if (!geocodeSuggestion) return;
    setLatitude(String(geocodeSuggestion.latitude));
    setLongitude(String(geocodeSuggestion.longitude));
    setGeocodeStatus('auto-filled');
    setGeocodeSuggestion(null);
  }

  function dismissGeocodeSuggestion() {
    setGeocodeSuggestion(null);
    setGeocodeStatus('idle');
  }

  // Looks up opening hours for this entry's coordinates via GET
  // /api/opening-hours-lookup (OpenStreetMap's Overpass API, proxied
  // server-side - see that endpoint's comment in server/index.js and the
  // hoursLookupStatus doc comment above). Needs coordinates already set -
  // the button below is disabled without them - since Overpass searches by
  // location, not name; the name is only used server-side to pick the
  // right result out of everything nearby, not to search on its own.
  function handleHoursLookup() {
    if (!latitude.trim() || !longitude.trim()) return;

    setHoursLookupStatus('loading');
    setHoursLookupSuggestion(null);

    fetchOsmOpeningHours(import.meta.env.VITE_API_URL, {
      name,
      latitude: latitude.trim(),
      longitude: longitude.trim(),
    })
      .then((result) => {
        if (!result) {
          setHoursLookupStatus('not-found');
          return;
        }
        if (result.converted) {
          setHoursLookupSuggestion({ name: result.name, converted: result.converted });
          setHoursLookupStatus('suggestion');
        } else {
          // OSM had something, but it used a construct this app doesn't
          // attempt to auto-translate (see convertOsmOpeningHours) - shown
          // as reference text to translate by hand, not a "Use this"
          // suggestion, since inserting raw OSM syntax into openingTimes
          // would silently break this app's own hours parser.
          setHoursLookupSuggestion({ name: result.name, raw: result.raw });
          setHoursLookupStatus('raw-only');
        }
      })
      .catch((err) => {
        console.error('Opening-hours lookup failed:', err);
        setHoursLookupStatus('error');
      });
  }

  function acceptHoursSuggestion() {
    if (!hoursLookupSuggestion?.converted) return;
    setOpeningTimes(hoursLookupSuggestion.converted);
    setHoursLookupStatus('idle');
    setHoursLookupSuggestion(null);
  }

  function dismissHoursSuggestion() {
    setHoursLookupSuggestion(null);
    setHoursLookupStatus('idle');
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
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            cityId: city.id,
            categoryId,
            name,
            status,
            summary,
            types: parseTypesInput(typesInput),
            phone,
            website,
            openingTimes,
            priceInfo,
            priceLevel: priceLevel === '' ? null : Number(priceLevel),
            description,
            photoUrl,
            icon: icon || null,
            notes,
            activityTypeId,
            shopTypeId,
            address: address.trim() || null,
            latitude: latitude.trim() === '' ? null : latitude.trim(),
            longitude: longitude.trim() === '' ? null : longitude.trim(),
          }),
        })
      : fetch(`${import.meta.env.VITE_API_URL}/api/entries/${entryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            name,
            // Omitted (not just re-sent as PUBLISHED) when a creator is
            // looking at an already-published entry they can't touch the
            // status of - see the read-only display below. Sending it
            // back unchanged would still trip the server's creator-can't-
            // publish check and block the rest of the save too.
            status: canPublish || status !== 'PUBLISHED' ? status : undefined,
            summary,
            types: parseTypesInput(typesInput),
            phone,
            website,
            openingTimes,
            priceInfo,
            priceLevel: priceLevel === '' ? null : Number(priceLevel),
            description,
            photoUrl,
            icon: icon || null,
            notes,
            address: address.trim() || null,
            latitude: latitude.trim() === '' ? null : latitude.trim(),
            longitude: longitude.trim() === '' ? null : longitude.trim(),
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

  // Not just visually hidden - a logged-out visitor never sees this
  // screen's markup at all, whatever url they land on it with. Placed
  // after every hook above so hook-call order never changes between
  // renders. See claude/todo.md.
  if (!isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  const cancelTo = isCreate
    ? groupedTypeId
      ? `/category/${slug}/type/${groupedTypeId}`
      : `/category/${slug}`
    : `/category/${slug}/entry/${entryId}`;

  const selectedIconOption = ESSENTIALS_ICON_OPTIONS.find((opt) => opt.key === icon);

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
      {categoryLoadError && (
        <div className="entry-editor-status">
          Couldn&apos;t load categories — the server may still be waking up.{' '}
          <button type="button" onClick={loadCategory}>
            Try again
          </button>
        </div>
      )}
      {!notFound && !categoryError && !categoryLoadError && (cityLoading || !ready) && (
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

          <div className="entry-editor-field">
            <span className="entry-editor-label">Status</span>
            {!canPublish && status === 'PUBLISHED' ? (
              <div className="entry-editor-status-readonly">
                Published — only an editor can change this.
              </div>
            ) : (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="entry-editor-input"
              >
                <option value="DRAFT">Draft</option>
                <option value="AWAITING_REVIEW">Awaiting Review</option>
                {canPublish && <option value="PUBLISHED">Published</option>}
              </select>
            )}
            <p className="entry-editor-hint">
              {canPublish
                ? 'Only Published entries show in the app.'
                : 'Flag this as Awaiting Review once it\'s ready for an editor to look at - only an editor can publish it.'}
            </p>
          </div>

          <label className="entry-editor-field">
            <span className="entry-editor-label">Summary (optional - shown on the card)</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="entry-editor-textarea entry-editor-textarea-short"
              rows={2}
            />
          </label>

          {/* Essentials-only icon picker (2026-09-19) - the mirror image of
              the venue-fields block below: shown ONLY for Essentials, since
              every other category's card has no icon at all. See
              essentialsIcons.jsx for the option list/colours and
              EntryCard.jsx's 'reference' variant for where this actually
              renders. A row of selectable colour swatches rather than a
              plain <select> so you can see what you're picking rather than
              reading option labels blind. Clicking the already-selected
              swatch clears it back to '' (falls back to the default pin
              icon on the card) - same toggle-off pattern the filter chips
              on CategoryScreen use. */}
          {isEssentials && (
            <div className="entry-editor-field">
              <span className="entry-editor-label">Icon (shown on the card)</span>
              <div className="entry-editor-icon-picker">
                {ESSENTIALS_ICON_OPTIONS.map((opt) => {
                  const Icon = opt.Icon;
                  return (
                    <button
                      type="button"
                      key={opt.key}
                      className={
                        icon === opt.key
                          ? 'entry-editor-icon-option is-selected'
                          : 'entry-editor-icon-option'
                      }
                      style={{ background: opt.color }}
                      aria-pressed={icon === opt.key}
                      aria-label={opt.label}
                      title={opt.label}
                      onClick={() => setIcon((prev) => (prev === opt.key ? '' : opt.key))}
                    >
                      <Icon />
                    </button>
                  );
                })}
              </div>
              <p className="entry-editor-hint">
                {selectedIconOption
                  ? selectedIconOption.label
                  : 'No icon selected - a default pin icon will be shown on the card.'}
              </p>
            </div>
          )}

          {/* Type/Phone/Website/Address/Coordinates/Opening times/Price are
              venue-shaped fields that don't apply to Essentials (reference
              content like airport/language/money, not places) - hidden
              here rather than removed, see the file comment at the top. */}
          {!isEssentials && (
            <>
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
                <span className="entry-editor-label">Address (optional)</span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onBlur={handleAddressLookup}
                  className="entry-editor-input"
                  placeholder="e.g. Carrer de Sant Carles 4, Barcelona"
                />
              </label>

              <div className="entry-editor-field">
                <span className="entry-editor-label">
                  Coordinates (optional - looked up automatically from the address above when you
                  leave the field; always worth a quick check, it isn&apos;t always exact)
                </span>
                <div className="entry-editor-coords-row">
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="entry-editor-input entry-editor-coord-input"
                    placeholder="Latitude"
                  />
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="entry-editor-input entry-editor-coord-input"
                    placeholder="Longitude"
                  />
                  <button
                    type="button"
                    className="entry-editor-geocode-button"
                    onClick={handleAddressLookup}
                    disabled={!address.trim() || geocodeStatus === 'loading'}
                  >
                    Find coordinates
                  </button>
                </div>

                {geocodeStatus === 'loading' && (
                  <p className="entry-editor-hint">Looking up coordinates…</p>
                )}
                {geocodeStatus === 'auto-filled' && (
                  <p className="entry-editor-hint">
                    Looked up automatically from the address - please verify (e.g. against the map on
                    the entry&apos;s detail screen once saved).
                  </p>
                )}
                {geocodeStatus === 'not-found' && (
                  <p className="entry-editor-hint">
                    Couldn&apos;t find coordinates for that address - enter them manually, or adjust
                    the address and try again.
                  </p>
                )}
                {geocodeStatus === 'error' && (
                  <p className="entry-editor-hint">
                    Coordinate lookup failed - try again, or enter coordinates manually.
                  </p>
                )}
                {geocodeStatus === 'suggestion' && geocodeSuggestion && (
                  <div className="entry-editor-geocode-suggestion">
                    <span>
                      Found: {geocodeSuggestion.latitude.toFixed(5)}, {geocodeSuggestion.longitude.toFixed(5)}
                    </span>
                    <button type="button" onClick={acceptGeocodeSuggestion}>
                      Use this
                    </button>
                    <button type="button" onClick={dismissGeocodeSuggestion}>
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

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

              {/* Opening-hours lookup (2026-09-26) - see the
                  hoursLookupStatus doc comment above and "Structured
                  opening hours" in claude/todo.md for why this pulls from
                  OpenStreetMap rather than Google Places (Google's terms
                  don't allow storing opening hours long-term the way this
                  field needs). A separate field block from Opening times
                  above, same split as Address/Coordinates above it -
                  needs its own button/hint/suggestion UI, not just a plain
                  label+textarea. Disabled until coordinates exist, since
                  Overpass searches by location, not name. */}
              <div className="entry-editor-field">
                <button
                  type="button"
                  className="entry-editor-geocode-button"
                  onClick={handleHoursLookup}
                  disabled={!latitude.trim() || !longitude.trim() || hoursLookupStatus === 'loading'}
                >
                  Find opening hours
                </button>

                {!latitude.trim() || !longitude.trim() ? (
                  <p className="entry-editor-hint">
                    Find coordinates above first - opening hours are looked up by location, not name.
                  </p>
                ) : (
                  <p className="entry-editor-hint">
                    Pulled from OpenStreetMap, which can be patchy or out of date - always double-check
                    against the real hours before saving.
                  </p>
                )}
                {hoursLookupStatus === 'loading' && (
                  <p className="entry-editor-hint">Looking up opening hours…</p>
                )}
                {hoursLookupStatus === 'not-found' && (
                  <p className="entry-editor-hint">
                    No opening hours found on OpenStreetMap near this location - enter them manually.
                  </p>
                )}
                {hoursLookupStatus === 'error' && (
                  <p className="entry-editor-hint">
                    Opening-hours lookup failed - try again, or enter them manually.
                  </p>
                )}
                {hoursLookupStatus === 'suggestion' && hoursLookupSuggestion && (
                  <div className="entry-editor-geocode-suggestion">
                    <span>
                      Found for &quot;{hoursLookupSuggestion.name}&quot;: {hoursLookupSuggestion.converted}
                    </span>
                    <button type="button" onClick={acceptHoursSuggestion}>
                      Use this
                    </button>
                    <button type="button" onClick={dismissHoursSuggestion}>
                      Dismiss
                    </button>
                  </div>
                )}
                {hoursLookupStatus === 'raw-only' && hoursLookupSuggestion && (
                  <div className="entry-editor-geocode-suggestion">
                    <span>
                      Found for &quot;{hoursLookupSuggestion.name}&quot;, but couldn&apos;t auto-format it
                      into our convention - OpenStreetMap&apos;s raw text: &quot;{hoursLookupSuggestion.raw}
                      &quot;. Translate it into the format above by hand if it looks right.
                    </span>
                    <button type="button" onClick={dismissHoursSuggestion}>
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              {/* Eating Out gets priceLevel (a $/$$/$$/$$$$ select) instead
                  of priceInfo - see the isEatingOut doc comment near the top
                  of this file for why the two don't both show at once. */}
              {isEatingOut ? (
                <label className="entry-editor-field">
                  <span className="entry-editor-label">
                    Price level (optional - shown on the card and used for the price filter,
                    from {currencySymbol} (budget) to {currencySymbol.repeat(4)} (top end))
                  </span>
                  <select
                    value={priceLevel}
                    onChange={(e) => setPriceLevel(e.target.value)}
                    className="entry-editor-input"
                  >
                    <option value="">Not set</option>
                    {[1, 2, 3, 4].map((level) => (
                      <option key={level} value={level}>
                        {currencySymbol.repeat(level)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="entry-editor-field">
                  <span className="entry-editor-label">
                    Price (optional - keep it short, e.g. &quot;€12, kids free&quot; or
                    &quot;Free&quot;. This is a headline price, not a full tariff table -
                    put a full breakdown in the description instead if you want one
                    on record)
                  </span>
                  <input
                    type="text"
                    value={priceInfo}
                    onChange={(e) => setPriceInfo(e.target.value)}
                    className="entry-editor-input"
                    placeholder="e.g. €12, kids free"
                  />
                </label>
              )}
            </>
          )}

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
