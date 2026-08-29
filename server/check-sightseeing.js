const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.entry
  .findMany({ where: { category: { slug: 'sightseeing' } } })
  .then((entries) => {
    console.log(`Found ${entries.length} sightseeing entries`);
    entries.forEach((e) => {
      console.log(`- ${e.name}: lat=${e.latitude}, lng=${e.longitude}, type=${e.type}`);
    });
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    return p.$disconnect();
  });
