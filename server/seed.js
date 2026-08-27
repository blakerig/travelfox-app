require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const lyon = await prisma.city.create({
    data: { name: 'Lyon', country: 'France', latitude: 45.764, longitude: 4.8357 },
  });

  const restaurantCategory = await prisma.category.create({
    data: { name: 'Restaurant' },
  });

  await prisma.place.create({
    data: {
      name: 'Le Bouchon des Cordeliers',
      description: 'Traditional Lyonnaise bistro',
      address: '15 Rue Claudia, 69002 Lyon',
      latitude: 45.7615,
      longitude: 4.8347,
      priceLevel: 2,
      rating: 4.5,
      cityId: lyon.id,
      categoryId: restaurantCategory.id,
    },
  });

  console.log('Seed data created.');
}

main().catch(console.error).finally(() => prisma.$disconnect());