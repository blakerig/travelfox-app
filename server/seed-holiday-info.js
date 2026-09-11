// Editorial content for the Public Holidays feature (2026-09-11) - the
// "why does this holiday exist" write-ups shown on HolidayDetail.jsx.
// Kept out of seed.js deliberately: seed.js's Lyon/restaurant/neighbourhood
// block below `main()`'s ACTIVITY_GROUPS section uses plain .create()/
// .createMany() rather than upserts, so re-running seed.js duplicates that
// sample data. This script only touches HolidayInfo, via .upsert(), so it's
// always safe to re-run - e.g. after adding a write-up for a new holiday, or
// editing the wording of an existing one. See claude/public-holidays-spec.md.
//
// Usage: node seed-holiday-info.js [path-to-env-file]
// Defaults to .env, same as backfill-holiday-locations.js - pass
// .env.production (or similar) to run against a remote database instead.
require('dotenv').config({ path: process.argv[2] || '.env', override: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// matchNames are best-guess localName/name strings as returned by
// Nager.Date for Spain (ES) - double check these against Blake's confirmed
// live API response before relying on them, since Nager.Date has no stable
// holiday ID and matching is by name (see matchHolidayInfo in index.js).
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
  console.log('Holiday write-ups seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
