-- AlterTable
ALTER TABLE "ActivityType" ADD COLUMN     "clusterId" INTEGER;

-- CreateTable
CREATE TABLE "ActivityTypeCluster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ActivityTypeCluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTypeCluster_slug_key" ON "ActivityTypeCluster"("slug");

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ActivityTypeCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
