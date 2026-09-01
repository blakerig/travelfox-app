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

async function main() {
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
