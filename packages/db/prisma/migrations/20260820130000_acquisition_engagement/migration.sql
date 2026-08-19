CREATE TYPE "AcquisitionEngagementStage" AS ENUM (
  'OUTREACH',
  'ENGAGED',
  'NDA',
  'MATERIALS_RECEIVED',
  'UNDERWRITING',
  'LOI',
  'DILIGENCE',
  'FINANCING',
  'CLOSING',
  'ACQUIRED',
  'PASSED'
);

CREATE TYPE "AcquisitionEngagementStatus" AS ENUM ('ACTIVE', 'TERMINAL');

CREATE TABLE "acquisitionEngagement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'workspace',
  "companyId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "stage" "AcquisitionEngagementStage" NOT NULL DEFAULT 'OUTREACH',
  "status" "AcquisitionEngagementStatus" NOT NULL DEFAULT 'ACTIVE',
  "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount" DECIMAL(14,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "expectedCloseDate" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "closedReason" TEXT,
  "baseAmount" DECIMAL(24,4),
  "baseCurrency" TEXT,
  "fxRate" DECIMAL(20,10),
  "fxRateAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "acquisitionEngagement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acquisitionEngagementCreateRequest" (
  "idempotencyKey" UUID NOT NULL,
  "engagementId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "acquisitionEngagementCreateRequest_pkey" PRIMARY KEY ("idempotencyKey")
);

ALTER TABLE "activity" ADD COLUMN "engagementId" TEXT;

CREATE UNIQUE INDEX "acquisitionEngagement_one_active_per_company"
  ON "acquisitionEngagement" ("organizationId", "companyId")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "acquisitionEngagement_organizationId_companyId_status_idx"
  ON "acquisitionEngagement" ("organizationId", "companyId", "status");

CREATE INDEX "acquisitionEngagement_organizationId_status_stageChangedAt_idx"
  ON "acquisitionEngagement" ("organizationId", "status", "stageChangedAt");

CREATE INDEX "acquisitionEngagement_ownerId_idx" ON "acquisitionEngagement" ("ownerId");

CREATE UNIQUE INDEX "acquisitionEngagementCreateRequest_engagementId_key"
  ON "acquisitionEngagementCreateRequest" ("engagementId");

ALTER TABLE "acquisitionEngagement"
  ADD CONSTRAINT "acquisitionEngagement_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "acquisitionEngagement"
  ADD CONSTRAINT "acquisitionEngagement_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "acquisitionEngagement"
  ADD CONSTRAINT "acquisitionEngagement_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "acquisitionEngagementCreateRequest"
  ADD CONSTRAINT "acquisitionEngagementCreateRequest_engagementId_fkey"
  FOREIGN KEY ("engagementId") REFERENCES "acquisitionEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity"
  ADD CONSTRAINT "activity_engagementId_fkey"
  FOREIGN KEY ("engagementId") REFERENCES "acquisitionEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
