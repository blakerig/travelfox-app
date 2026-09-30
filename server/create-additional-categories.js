// One-time setup: creates the Category rows for sections that don't have
// any content yet but already have their own bundled icon art in
// client/src/assets/ (cropped from the same sheet as Barcelona's icons,
// see client/src/assets/city-icons/barcelona/) and an entry in Home.jsx's
// CATEGORY_DISPLAY - Itineraries, Day Trips, What's On, Tours, Short Stay,
// Long Stay, Accommodations.
//
// Creating the row is what makes a category available to add entries to at
// all - CategoryScreen.jsx's generic /category/:slug route already renders
// an empty state with a working "+ Add" link for any category a logged-in
// team member navigates to, whether or not any city has content there yet
// (see the "discovery" section added to Home.jsx alongside this script).
// A category stays invisible on a given city's home screen until that city
// actually has a published entry in it - same automatic check every other
// category already goes through, see the home-categories logic in
// server/index.js. So running this script doesn't make anything new appear
// anywhere by itself - it just makes these categories choosable.
//
// Safe to re-run - each row is upserted by slug rather than duplicated.
//
// Run once against local, once against Neon (when ready to make these
// choosable in production too):
//   node create-additional-categories.js .env
//   node create-additional-categories.js .env-production
require('dotenv').config({ path: process.argv[2] || '.env', override: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CATEGORIES = [
  { slug: 'itineraries', name: 'Itineraries' },
  { slug: 'day-trips', name: 'Day Trips' },
  { slug: 'whats-on', name: "What's On" },
  { slug: 'tours', name: 'Tours' },
  { slug: 'short-stay', name: 'Short Stay' },
  { slug: 'long-stay', name: 'Long Stay' },
  { slug: 'accommodations', name: 'Accommodations' },
];

async function main() {
  for (const { slug, name } of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { slug },
      create: { slug, name },
      update: { name },
    });
    console.log(`${slug}: id=${category.id}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
