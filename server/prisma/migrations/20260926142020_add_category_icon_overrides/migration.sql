-- CreateTable
CREATE TABLE "CategoryIcon" (
    "id" SERIAL NOT NULL,
    "cityId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "iconUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryIcon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryIcon_cityId_categoryId_key" ON "CategoryIcon"("cityId", "categoryId");

-- AddForeignKey
ALTER TABLE "CategoryIcon" ADD CONSTRAINT "CategoryIcon_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryIcon" ADD CONSTRAINT "CategoryIcon_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
