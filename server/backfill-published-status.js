// One-time script: run immediately after the add-user-roles-and-entry-
// status migration applies. That migration's new Entry.status column
// defaults every row - including every entry that already existed - to
// DRAFT, which is correct for future rows but wrong for the ones that
// were already live. This sets every entry that exists right now to
// PUBLISHED, once. Don't re-run it later without thinking - a second run
// would also (harmlessly) re-publish anything that's a genuine draft by
// that point.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const { count } = await prisma.entry.updateMany({ data: { status: 'PUBLISHED' } });
  console.log(`Set ${count} existing entr${count === 1 ? 'y' : 'ies'} to PUBLISHED.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
