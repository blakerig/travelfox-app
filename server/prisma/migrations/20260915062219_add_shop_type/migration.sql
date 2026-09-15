-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "shopTypeId" INTEGER;

-- CreateTable
CREATE TABLE "ShopType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "cityId" INTEGER NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ShopType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopType_cityId_slug_key" ON "ShopType"("cityId", "slug");

-- AddForeignKey
ALTER TABLE "ShopType" ADD CONSTRAINT "ShopType_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_shopTypeId_fkey" FOREIGN KEY ("shopTypeId") REFERENCES "ShopType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
