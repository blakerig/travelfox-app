// One-time backfill for the Public Holidays feature (see
// claude/public-holidays-spec.md and PublicHoliday/HolidayInfo/Country.code/
// City.subdivisionCode in schema.prisma) - sets the country code and, where
// relevant, the region code/name that GET /api/cities/:cityId/holidays needs
// to know which holidays apply to each city. Existing Country/City rows
// predate these fields (see their comments in schema.prisma), so nothing
// shows for a city until it's been backfilled here.
//
// Run once against local, once against Neon (same pattern as
// fix-city-coordinates.js):
//   node backfill-holiday-locations.js .env
//   node backfill-holiday-locations.js .env-production
require('dotenv').config({ path: process.argv[2] || '.env', override: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ISO 3166-1 alpha-2 codes, keyed by Country.name as seeded/entered so far
// (see seed.js - "France" - and Barcelona/The Hague's countries, entered by
// hand in Prisma Studio). Add a row here whenever a new country is added,
// rather than leaving it uncoded - see Country.code's comment for what a
// missing code does (the Public Holidays row just doesn't show).
const COUNTRY_CODES = {
  France: 'FR',
  Spain: 'ES',
  Netherlands: 'NL',
};

// Region (ISO 3166-2) backfill, keyed by City.name - only cities whose
// country actually has its own sub-national holidays need an entry here;
// a city with no entry just sees nationwide holidays only (see
// City.subdivisionCode's comment in schema.prisma).
const CITY_SUBDIVISIONS = {
  Barcelona: { code: 'ES-CT', name: 'Catalonia' },
};

async function main() {
  for (const [name, code] of Object.entries(COUNTRY_CODES)) {
    const country = await prisma.country.findUnique({ where: { name } });
    if (!country) {
      console.log(`No Country named "${name}" - skipping`);
      continue;
    }
    if (country.code === code) {
      console.log(`Country "${name}" already has code ${code} - skipping`);
      continue;
    }
    await prisma.country.update({ where: { name }, data: { code } });
    console.log(`Country "${name}": code -> ${code}`);
  }

  for (const [name, { code, name: subdivisionName }] of Object.entries(CITY_SUBDIVISIONS)) {
    const city = await prisma.city.findFirst({ where: { name } });
    if (!city) {
      console.log(`No City named "${name}" - skipping`);
      continue;
    }
    if (city.subdivisionCode === code && city.subdivisionName === subdivisionName) {
      console.log(`City "${name}" already has subdivision ${code} (${subdivisionName}) - skipping`);
      continue;
    }
    await prisma.city.update({
      where: { id: city.id },
      data: { subdivisionCode: code, subdivisionName },
    });
    console.log(`City "${name}": subdivision -> ${code} (${subdivisionName})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
