// One-time setup: uploads Barcelona's own home-screen category icon art
// (cropped from a designer's icon sheet - see client/src/assets/city-icons/
// barcelona/) to Cloudinary and records each one as a CategoryIcon override
// for the Barcelona City row (see CategoryIcon in schema.prisma). Only
// covers categories that already exist (essentials, activities, eating-out,
// local-cuisine, sightseeing, shopping, neighbourhoods) - the extra icons
// cropped from the same sheet (itineraries, day-trips, whats-on, tours,
// short-stay, long-stay, accommodations) are stored as files for now but
// have no Category row yet, so there's nothing to attach them to until
// those sections are built.
//
// Safe to re-run: each upload/upsert is keyed by (Barcelona's cityId,
// category), so running this again just re-uploads and overwrites the same
// rows rather than creating duplicates.
//
// Run once against local, once against Neon (once you're ready to make this
// live in production too):
//   node set-barcelona-category-icons.js .env
//   node set-barcelona-category-icons.js .env-production
require('dotenv').config({ path: process.argv[2] || '.env', override: true });
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { v2: cloudinary } = require('cloudinary');

const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ICONS_DIR = path.join(__dirname, '..', 'client', 'src', 'assets', 'city-icons', 'barcelona');

// slug -> icon filename, for every category that already exists in the
// schema. (See the file header above for the ones deliberately left out.)
const ICON_FILES = {
  essentials: 'icon-essentials.png',
  activities: 'icon-activities.png',
  'eating-out': 'icon-eating-out.png',
  'local-cuisine': 'icon-local-cuisine.png',
  sightseeing: 'icon-sightseeing.png',
  shopping: 'icon-shopping.png',
  neighbourhoods: 'icon-neighbourhoods.png',
};

async function main() {
  const city = await prisma.city.findFirst({ where: { name: 'Barcelona' } });
  if (!city) {
    console.log('No City named "Barcelona" found - skipping');
    return;
  }

  for (const [slug, filename] of Object.entries(ICON_FILES)) {
    const category = await prisma.category.findUnique({ where: { slug } });
    if (!category) {
      console.log(`No Category with slug="${slug}" - skipping ${filename}`);
      continue;
    }

    const filePath = path.join(ICONS_DIR, filename);
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'travelfox/category-icons/barcelona',
    });

    await prisma.categoryIcon.upsert({
      where: { cityId_categoryId: { cityId: city.id, categoryId: category.id } },
      create: { cityId: city.id, categoryId: category.id, iconUrl: result.secure_url },
      update: { iconUrl: result.secure_url },
    });

    console.log(`${slug}: ${result.secure_url}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
