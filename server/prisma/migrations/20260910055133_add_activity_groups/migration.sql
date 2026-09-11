-- AlterTable
ALTER TABLE "ActivityType" ADD COLUMN     "groupId" INTEGER;

-- CreateTable
CREATE TABLE "ActivityGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ActivityGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityGroup_slug_key" ON "ActivityGroup"("slug");

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ActivityGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
