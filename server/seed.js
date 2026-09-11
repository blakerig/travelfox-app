require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// These five match the home screen's category grid (client/src/Home.jsx).
const CATEGORIES = [
  { slug: 'essentials', name: 'Essentials' },
  { slug: 'activities', name: 'Activities' },
  { slug: 'eating-out', name: 'Eating Out' },
  { slug: 'sightseeing', name: 'Sightseeing' },
  { slug: 'local-cuisine', name: 'Local Cuisine' },
  { slug: 'neighbourhoods', name: 'Neighbourhoods' },
];

// Fixed, curated set of broader activity-interest groups, shown as filter
// chips on the Activities screen (2026-09-10, see ActivityGroup in
// schema.prisma). Upserted the same way CATEGORIES is above, so re-running
// this script is always safe. sortOrder fixes the display order
// deliberately rather than leaving it to alphabetical (see that field's
// comment in schema.prisma). Existing ActivityType rows aren't assigned to
// a group by this script - that's a per-row decision made by hand in Prisma
// Studio, same as everything else ActivityType-shaped.
const ACTIVITY_GROUPS = [
  { slug: 'sport-active', name: 'Sport & Active', sortOrder: 1 },
  { slug: 'culture-arts', name: 'Culture & Arts', sortOrder: 2 },
  { slug: 'outdoors-nature', name: 'Outdoors & Nature', sortOrder: 3 },
  { slug: 'fun-entertainment', name: 'Fun & Entertainment', sortOrder: 4 },
];

// Editorial content for the Public Holidays feature (2026-09-11, see
// claude/public-holidays-spec.md and HolidayInfo in schema.prisma) -
// written once per recurring holiday, matched to a live Nager.Date row by
// name at request time (see matchHolidayInfo in server/index.js). Starting
// with just Barcelona's two Catalonia-only holidays, since those are the
// ones nationwide sources don't already cover for a Spain-wide audience -
// worth extending to the national ~10 (New Year's Day, Epiphany, ...) once
// there's time, but those are far more widely known already.
//
// matchNames lists every wording variant this might come back as - Nager.Date's
// exact localName/name strings for Spain haven't been confirmed against a
// live response from this session (see claude/public-holidays-spec.md's
// "not yet confirmed" note); double-check these against the real response
// and add/adjust variants if a holiday isn't matching.
const HOLIDAY_INFO = [
  {
    slug: 'diada-catalunya',
    matchNames: [
      'Diada Nacional de Catalunya',
      'Fiesta Nacional de Cataluña',
      'National Day of Catalonia',
    ],
    description:
      "This solemn day marks the fall of Barcelona on 11 September 1714, after a 14-month siege during the War of the Spanish Succession. The defeat led to the Nueva Planta decrees, which abolished Catalonia's own institutions and legal system - which is why the Diada is remembered rather than celebrated.\n\nExpect red-and-yellow senyera and blue-starred estelada flags across the city, floral offerings at the Rafael Casanova monument, and large gatherings that grow through the afternoon, especially around Ciutadella Park and the city centre.",
    whatToExpect:
      'Most shops and many restaurants close for the public holiday, as on a Sunday. Large demonstrations and road closures are likely downtown and near Ciutadella Park from the afternoon onward. Public transport keeps running but can be slower and more crowded near rally routes.',
  },
  {
    slug: 'sant-esteve',
    matchNames: ['Sant Esteve', 'San Esteban', "St. Stephen's Day", "Saint Stephen's Day"],
    description:
      "Named for the first Christian martyr, Sant Esteve became a Catalonia-only holiday because of the region's Carolingian-era ties to Charlemagne's empire: with travel slow in the 9th century, the day after Christmas was kept free so families had time to get home. The Catalan saying “per Nadal cada ovella al seu corral, per Sant Esteve, cadascú a casa seva” - roughly “at Christmas, everyone to the fold; at Sant Esteve, everyone home” - captures the tradition. The day is best known now for canelons, a pasta dish made from Christmas leftovers that shows up on nearly every Catalan table.",
    whatToExpect:
      "Shops and most museums are closed, much like Christmas Day itself. It's a quiet, family day rather than a public event, so streets are calmer than the day before.",
  },
];

async function main() {
  await Promise.all(
    HOLIDAY_INFO.map((h) =>
      prisma.holidayInfo.upsert({
        where: { slug: h.slug },
        update: { matchNames: h.matchNames, description: h.description, whatToExpect: h.whatToExpect },
        create: h,
      })
    )
  );

  const categories = await Promise.all(
    CATEGORIES.map((c) =>
      prisma.category.upsert({
        where: { slug: c.slug },
        update: { name: c.name },
        create: c,
      })
    )
  );
  const eatingOut = categories.find((c) => c.slug === 'eating-out');

  await Promise.all(
    ACTIVITY_GROUPS.map((g) =>
      prisma.activityGroup.upsert({
        where: { slug: g.slug },
        update: { name: g.name, sortOrder: g.sortOrder },
        create: g,
      })
    )
  );

  const lyon = await prisma.city.create({
    data: {
      name: 'Lyon',
      latitude: 45.764,
      longitude: 4.8357,
      // connectOrCreate so re-running seed.js against a DB that already has
      // a France row (e.g. from hand-entering another French city) reuses
      // it rather than erroring on the @unique country name.
      country: {
        connectOrCreate: {
          where: { name: 'France' },
          create: { name: 'France', currencyName: 'Euro', currencySymbol: '€' },
        },
      },
    },
  });

  await prisma.entry.create({
    data: {
      name: 'Le Bouchon des Cordeliers',
      summary: 'Old-school Lyon bistro - go for the quenelles.',
      description: 'Traditional Lyonnaise bistro',
      address: '15 Rue Claudia, 69002 Lyon',
      latitude: 45.7615,
      longitude: 4.8347,
      priceLevel: 2,
      types: ['French'],
      rating: 4.5,
      cityId: lyon.id,
      categoryId: eatingOut.id,
    },
  });

  // Sample Neighbourhood rows for Lyon, added 2026-08-31 alongside the
  // Neighbourhoods map screen (see Neighbourhood in schema.prisma).
  // Coordinates are approximate centroids, entered by hand the same way
  // Entry.latitude/longitude are - worth double-checking on
  // openstreetmap.org before this goes further than local dev, same
  // workflow already used for restaurant coordinates.
  await prisma.neighbourhood.createMany({
    data: [
      {
        name: 'Vieux Lyon',
        slug: 'vieux-lyon',
        latitude: 45.7599,
        longitude: 4.8271,
        description: 'Renaissance old town on the west bank of the Saone - cobbled lanes, traboules, and the base of the Fourviere funicular.',
        cityId: lyon.id,
      },
      {
        name: 'Presqu\'ile',
        slug: 'presquile',
        latitude: 45.764,
        longitude: 4.8357,
        description: "The peninsula between Lyon's two rivers - the city centre, main shopping streets, and Place Bellecour.",
        cityId: lyon.id,
      },
      {
        name: 'Croix-Rousse',
        slug: 'croix-rousse',
        latitude: 45.7745,
        longitude: 4.832,
        description: 'Hillside district north of the centre, once the silk-weaving quarter - now a village-like mix of workshops, markets, and viewpoints over the city.',
        cityId: lyon.id,
      },
    ],
  });

  console.log('Seed data created.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
