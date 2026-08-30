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
      type: 'French',
      rating: 4.5,
      cityId: lyon.id,
      categoryId: eatingOut.id,
    },
  });

  console.log('Seed data created.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
