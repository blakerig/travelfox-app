require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// In-memory storage - files are streamed straight to Cloudinary, never
// written to disk on the server. 8MB cap comfortably covers a phone photo.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// Uploads a single image to Cloudinary and returns its URL. Decoupled from
// the entry create/update endpoints on purpose: the client uploads the file
// here first, gets back a URL, then sends that URL as a normal string field
// (`photoUrl`) alongside name/summary/etc - the entry endpoints never see
// raw file data. See claude/todo.md for the hosting-provider decision
// (2026-08-29: Cloudinary, free tier).
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const stream = cloudinary.uploader.upload_stream(
    { folder: 'travelfox/entries' },
    (err, result) => {
      if (err) {
        console.error('Cloudinary upload failed:', err);
        return res.status(500).json({ error: 'Upload failed' });
      }
      res.json({ url: result.secure_url });
    }
  );
  stream.end(req.file.buffer);
});

app.get('/api/cities', async (req, res) => {
  // include country so the client has currencyName/currencySymbol (and
  // country name) without a second round-trip - see Country model in
  // schema.prisma, added 2026-08-28.
  const cities = await prisma.city.findMany({ include: { country: true } });
  res.json(cities);
});

// Text-only edit for an existing city - currently just photoUrl, used by
// CityEditor.jsx (client/src/CityEditor.jsx) to set the Home hero photo
// without going through Prisma Studio. Deliberately scoped this narrowly,
// same reasoning as the entries PATCH above - name/latitude/longitude/
// countryId still go through Studio, since there's no in-app UI for those
// yet either. Extend this (and the client form) if that changes.
app.patch('/api/cities/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { photoUrl } = req.body;

  const data = {};
  if (photoUrl !== undefined) data.photoUrl = photoUrl === '' ? null : photoUrl;

  try {
    const city = await prisma.city.update({
      where: { id },
      data,
      include: { country: true },
    });
    res.json(city);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'City not found' });
    }
    console.error('Failed to update city:', err);
    res.status(500).json({ error: 'Failed to update city' });
  }
});

app.get('/api/cities/:cityId/entries', async (req, res) => {
  const cityId = Number(req.params.cityId);
  // Optional ?category=<slug> filter - used by the CategoryScreen so it can
  // fetch just the entries for the category the user clicked into.
  const { category } = req.query;

  const where = { cityId };
  if (category) {
    where.category = { slug: category };
  }

  const entries = await prisma.entry.findMany({
    where,
    include: { category: true },
    // Manual curation order (see Entry.sortOrder in schema.prisma), ties
    // broken by id so same-sortOrder entries stay in a stable, predictable
    // order rather than shuffling between requests.
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  res.json(entries);
});

// Single entry, for the entry-detail screen (tapping into a card).
app.get('/api/entries/:id', async (req, res) => {
  const id = Number(req.params.id);
  const entry = await prisma.entry.findUnique({
    where: { id },
    // activityType included (2026-08-28) so EntryDetail.jsx can send a
    // provider's "back" link to its ActivityType screen instead of the
    // flat category list - see Entry.activityTypeId in schema.prisma. null
    // for every entry outside Activities.
    include: { category: true, activityType: true },
  });
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json(entry);
});

// Create a new entry. Used by the "+ Add" button on CategoryScreen: city and
// category are set immediately (from the current city/category context),
// name/summary/description come later via the editor form - this endpoint
// doesn't get called until the user actually hits Save there, so there's no
// window where a half-empty stub entry exists in the database.
app.post('/api/entries', async (req, res) => {
  const { cityId, categoryId, name, summary, description, types, photoUrl, activityTypeId } = req.body;

  if (!cityId || !categoryId) {
    return res.status(400).json({ error: 'cityId and categoryId are required' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }

  try {
    const entry = await prisma.entry.create({
      data: {
        name,
        summary: summary || null,
        description: description || null,
        types: Array.isArray(types) ? types : [],
        photoUrl: photoUrl || null,
        city: { connect: { id: Number(cityId) } },
        category: { connect: { id: Number(categoryId) } },
        // Optional - only sent by EntryEditor.jsx when "+ Add provider" was
        // used from ActivityTypeDetail.jsx (?activityTypeId=<id> in the
        // URL), linking the new provider Entry to its ActivityType the same
        // way city/category are already resolved automatically rather than
        // typed in the form. Omitted (undefined/falsy) for every other
        // "+ Add" entry point.
        ...(activityTypeId ? { activityType: { connect: { id: Number(activityTypeId) } } } : {}),
      },
      include: { category: true },
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('Failed to create entry:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

// Text-only edit for an existing entry (name/summary/description). Scoped
// deliberately to these three String fields for now - editing city,
// category, location, price, or rating still goes through Prisma Studio.
// See project notes if/when this needs to grow into a full editor.
app.patch('/api/entries/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, summary, description, types, photoUrl } = req.body;

  const data = {};
  if (name !== undefined) {
    if (!name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    data.name = name;
  }
  if (summary !== undefined) data.summary = summary === '' ? null : summary;
  if (description !== undefined) data.description = description === '' ? null : description;
  if (types !== undefined) data.types = Array.isArray(types) ? types : [];
  if (photoUrl !== undefined) data.photoUrl = photoUrl === '' ? null : photoUrl;

  try {
    const entry = await prisma.entry.update({
      where: { id },
      data,
      include: { category: true },
    });
    res.json(entry);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Entry not found' });
    }
    console.error('Failed to update entry:', err);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// ActivityType rows for a city (2026-08-28, see ActivityType in
// schema.prisma) - what CategoryScreen.jsx fetches for the Activities
// category instead of a flat entries list (see groupedByType in
// categoryConfig.js). Each type carries its provider Entries inline so the
// client can decide per-card, without a second round-trip, whether to link
// to ActivityTypeDetail or straight to a single provider (see
// activityTypeHref in CategoryScreen.jsx).
app.get('/api/cities/:cityId/activity-types', async (req, res) => {
  const cityId = Number(req.params.cityId);
  const activityTypes = await prisma.activityType.findMany({
    where: { cityId },
    include: {
      entries: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  res.json(activityTypes);
});

// Single ActivityType with its providers, for ActivityTypeDetail.jsx -
// fetched independently (not just read out of the city-level list above)
// so the screen also works if reached directly, e.g. a bookmarked link,
// matching how GET /api/entries/:id already works for EntryDetail.
app.get('/api/activity-types/:id', async (req, res) => {
  const id = Number(req.params.id);
  const activityType = await prisma.activityType.findUnique({
    where: { id },
    include: {
      entries: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!activityType) {
    return res.status(404).json({ error: 'Activity type not found' });
  }
  res.json(activityType);
});

app.get('/api/categories', async (req, res) => {
  const categories = await prisma.category.findMany();
  res.json(categories);
});

// Returns only the categories that have at least one entry in this city -
// this is what the home screen's icon grid uses to decide which icons to
// show (an icon should never appear for an empty category).
app.get('/api/cities/:cityId/home-categories', async (req, res) => {
  const cityId = Number(req.params.cityId);
  const categories = await prisma.category.findMany({
    where: { entries: { some: { cityId } } },
  });

  // Activities also counts as having content if this city has at least one
  // ActivityType, even with zero provider Entries so far (2026-08-28, see
  // ActivityType in schema.prisma) - a type with no providers yet is a
  // valid, deliberate state (e.g. "too many providers to list
  // individually"), not missing data, so the Entry-based check above alone
  // would wrongly hide the Activities icon for a city whose only Activities
  // content right now is a description-only type.
  if (!categories.some((c) => c.slug === 'activities')) {
    const hasActivityType = await prisma.activityType.findFirst({ where: { cityId } });
    if (hasActivityType) {
      const activitiesCategory = await prisma.category.findUnique({ where: { slug: 'activities' } });
      if (activitiesCategory) categories.push(activitiesCategory);
    }
  }

  res.json(categories);
});

// Free-text search across a city's Entries and ActivityTypes - what
// Search.jsx calls as the user types into the home-screen search bar (see
// Home.jsx). Matches name/summary/description via a case-insensitive
// substring on each field. Entry.types (the free-text cuisine/place-type
// array) is deliberately not searched here - Prisma's array filters only
// support exact-value matching, not substring, and this endpoint is meant
// to behave like a plain "search everything" box rather than a faceted
// lookup (that's what CategoryScreen's type filter chips are for).
//
// Entries and ActivityTypes come back merged into one ranked list (not as
// separate sections) so a search for "padel" surfaces the Padel
// ActivityType card the same way "tapas" surfaces a restaurant - the
// client tells results apart via each one's `kind` field and shows a small
// category badge (see Search.jsx). Ranking is a simple three-tier scheme
// (name match, then summary match, then description-only match,
// alphabetical within each tier) rather than a real search/ranking
// library - plenty for this dataset's size, revisit if/when that stops
// being true.
app.get('/api/cities/:cityId/search', async (req, res) => {
  const cityId = Number(req.params.cityId);
  const q = (req.query.q || '').trim();

  if (!q) {
    return res.json([]);
  }

  const textFilter = (field) => ({ [field]: { contains: q, mode: 'insensitive' } });

  const [entries, activityTypes] = await Promise.all([
    prisma.entry.findMany({
      where: {
        cityId,
        OR: [textFilter('name'), textFilter('summary'), textFilter('description')],
      },
      include: { category: true },
      take: 30,
    }),
    prisma.activityType.findMany({
      where: {
        cityId,
        OR: [textFilter('name'), textFilter('summary'), textFilter('description')],
      },
      // Just the id of each provider Entry - enough for the client to show
      // a "N providers" count on the group card (see EntryCard.jsx's
      // 'group' variant), without pulling every provider field along for
      // the ride.
      include: { entries: { select: { id: true } } },
      take: 15,
    }),
  ]);

  const results = [
    ...entries.map((e) => ({ kind: 'entry', ...e })),
    ...activityTypes.map((t) => ({
      kind: 'activityType',
      id: t.id,
      name: t.name,
      summary: t.summary,
      description: t.description,
      entries: t.entries,
    })),
  ];

  const lower = q.toLowerCase();
  function matchRank(item) {
    if (item.name?.toLowerCase().includes(lower)) return 0;
    if (item.summary?.toLowerCase().includes(lower)) return 1;
    if (item.description?.toLowerCase().includes(lower)) return 2;
    return 3;
  }
  results.sort((a, b) => matchRank(a) - matchRank(b) || a.name.localeCompare(b.name));

  res.json(results.slice(0, 30));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
