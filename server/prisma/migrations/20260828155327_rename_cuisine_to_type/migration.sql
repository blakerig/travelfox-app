-- RenameColumn
-- Written by hand rather than generated via `prisma migrate dev`: a plain
-- ADD/DROP diff would silently drop existing cuisine data. This is a true
-- column rename, so existing values (e.g. the seeded "French") survive.
ALTER TABLE "Entry" RENAME COLUMN "cuisine" TO "type";
