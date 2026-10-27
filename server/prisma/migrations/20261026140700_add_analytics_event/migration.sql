-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "cityId" INTEGER,
    "categorySlug" TEXT,
    "entryId" INTEGER,
    "path" TEXT,
    "query" TEXT,
    "resultCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventType_createdAt_idx" ON "AnalyticsEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_entryId_idx" ON "AnalyticsEvent"("entryId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_deviceId_idx" ON "AnalyticsEvent"("deviceId");
