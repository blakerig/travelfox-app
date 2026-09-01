// One-time fix: Barcelona and The Hague had wrong City.latitude/longitude
// (Barcelona was still carrying Lyon's coordinates from before the
// seedNeighbourhoods.js switch; The Hague was never set, left at 0,0).
//
// Run once against local, once against Neon:
//   node fix-city-coordinates.js .env
//   node fix-city-coordinates.js .env-production
require('dotenv').config({ path: process.argv[2] || '.env', override: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const fixes = [
  { id: 2, name: 'Barcelona', latitude: 41.3851, longitude: 2.1734 },
  { id: 3, name: 'The Hague', latitude: 52.0705, longitude: 4.3007 },
];

async function main() {
  for (const fix of fixes) {
    const before = await prisma.city.findUnique({ where: { id: fix.id } });
    if (!before) {
      console.log(`No City with id=${fix.id} (${fix.name}) - skipping`);
      continue;
    }
    if (before.name !== fix.name) {
      console.log(`City id=${fix.id} is named "${before.name}", not "${fix.name}" - skipping to be safe`);
      continue;
    }
    const after = await prisma.city.update({
      where: { id: fix.id },
      data: { latitude: fix.latitude, longitude: fix.longitude },
    });
    console.log(`${fix.name}: (${before.latitude}, ${before.longitude}) -> (${after.latitude}, ${after.longitude})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
