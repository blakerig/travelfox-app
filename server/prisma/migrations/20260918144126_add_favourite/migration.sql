-- CreateTable
CREATE TABLE "Favourite" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favourite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Favourite_deviceId_idx" ON "Favourite"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Favourite_deviceId_entryId_key" ON "Favourite"("deviceId", "entryId");

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
