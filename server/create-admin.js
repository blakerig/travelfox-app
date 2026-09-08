// One-time bootstrap: creates (or resets) the first Admin account. Can't
// go through POST /api/users since nothing exists yet to grant that
// request - see claude/todo.md's "User accounts / login" items. Run
// locally, once:
//   node create-admin.js you@example.com "your password"
// Never hardcode a real password in this file or commit one.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('./auth');

const prisma = new PrismaClient();

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: node create-admin.js <email> <password>');
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN' },
    create: { email, passwordHash, role: 'ADMIN' },
  });
  console.log(`Admin ready: ${user.email} (id ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
