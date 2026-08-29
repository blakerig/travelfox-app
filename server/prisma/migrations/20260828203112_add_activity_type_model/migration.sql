-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "activityTypeId" INTEGER;

-- CreateTable
CREATE TABLE "ActivityType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "cityId" INTEGER NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ActivityType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityType_cityId_slug_key" ON "ActivityType"("cityId", "slug");

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
