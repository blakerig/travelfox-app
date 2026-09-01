require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Standalone, idempotent counterpart to the Neighbourhood block in
// seed.js (2026-08-31) - safe to run against a dev DB that already has
// content, unlike re-running the whole of seed.js (which would `create()`
// a second city + a duplicate restaurant, since City.name isn't unique).
// This script only touches the `neighbourhoods` Category row (upsert,
// same as seed.js) and Neighbourhood rows for whichever city already
// exists (upsert on the [cityId, slug] unique constraint) - never creates
// a City or Entry, so it's safe to run more than once.
//
// Targets Barcelona (switched from the original Lyon version 2026-08-31
// once the user deleted their Lyon row) - Barcelona already exists as a
// City in this DB (see the countryId migration note in schema.prisma).
// Coordinates are approximate, entered from general knowledge, not
// looked up - see the "Verify the hand-entered neighbourhood
// coordinates" item in claude/todo.md before relying on these beyond
// local dev.
const CITY_NAME = 'Barcelona';

const NEIGHBOURHOODS = [
  {
    name: 'Gràcia',
    slug: 'gracia',
    latitude: 41.4036,
    longitude: 2.1527,
    description:
      'Village-like district north of the centre, once its own town - narrow streets, leafy squares, and an independent, bohemian feel.',
  },
  {
    name: 'Eixample',
    slug: 'eixample',
    latitude: 41.3925,
    longitude: 2.16,
    description:
      "The grid-planned centre between the old town and Gràcia - wide diagonal boulevards, most of Gaudí's landmark buildings, and the main shopping streets.",
  },
  {
    name: 'El Born',
    slug: 'el-born',
    latitude: 41.385,
    longitude: 2.1823,
    description:
      'Medieval lanes next to the old town - the Picasso Museum, Santa Maria del Mar, and a dense cluster of tapas bars and small shops.',
  },
  {
    name: 'Barceloneta',
    slug: 'barceloneta',
    latitude: 41.3784,
    longitude: 2.1925,
    description:
      "Former fishing quarter on a narrow spit between the port and the beach - a tight grid of streets, seafood restaurants, and the city's closest beach access.",
  },
  {
    name: 'Poble Sec',
    slug: 'poble-sec',
    latitude: 41.3736,
    longitude: 2.1615,
    description:
      'Hillside neighbourhood below Montjuïc - a quieter, mixed residential/nightlife area with easy access to the Montjuïc gardens and museums above it.',
  },
];

async function main() {
  const city = await prisma.city.findFirst({ where: { name: CITY_NAME } });
  if (!city) {
    console.error(
      `No city named "${CITY_NAME}" found - run this against a DB that already has ${CITY_NAME} seeded, or edit CITY_NAME/NEIGHBOURHOODS in this file for a different city.`
    );
    process.exitCode = 1;
    return;
  }

  await prisma.category.upsert({
    where: { slug: 'neighbourhoods' },
    update: { name: 'Neighbourhoods' },
    create: { slug: 'neighbourhoods', name: 'Neighbourhoods' },
  });

  for (const n of NEIGHBOURHOODS) {
    await prisma.neighbourhood.upsert({
      where: { cityId_slug: { cityId: city.id, slug: n.slug } },
      update: {
        name: n.name,
        latitude: n.latitude,
        longitude: n.longitude,
        description: n.description,
      },
      create: { ...n, cityId: city.id },
    });
  }

  console.log(`Upserted ${NEIGHBOURHOODS.length} neighbourhoods onto ${city.name} (id ${city.id}).`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
