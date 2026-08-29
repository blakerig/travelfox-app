const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.entry
  .findFirst()
  .then((e) => {
    console.log(e);
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    return p.$disconnect();
  });
