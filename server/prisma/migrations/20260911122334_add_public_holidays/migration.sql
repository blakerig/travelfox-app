/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Country` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "City" ADD COLUMN     "subdivisionCode" TEXT,
ADD COLUMN     "subdivisionName" TEXT;

-- AlterTable
ALTER TABLE "Country" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" SERIAL NOT NULL,
    "countryCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "localName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "global" BOOLEAN NOT NULL DEFAULT true,
    "subdivisionCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayInfo" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "matchNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL,
    "whatToExpect" TEXT,

    CONSTRAINT "HolidayInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_countryCode_year_date_localName_key" ON "PublicHoliday"("countryCode", "year", "date", "localName");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayInfo_slug_key" ON "HolidayInfo"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");
