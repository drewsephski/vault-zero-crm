CREATE TYPE "VaultZeroEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "vaultZeroLead" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaultZeroLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vaultZeroLead_submissionId_key" ON "vaultZeroLead"("submissionId");
CREATE INDEX "vaultZeroLead_companyId_idx" ON "vaultZeroLead"("companyId");
CREATE INDEX "vaultZeroLead_contactId_idx" ON "vaultZeroLead"("contactId");
CREATE INDEX "vaultZeroLead_dealId_idx" ON "vaultZeroLead"("dealId");

CREATE TABLE "vaultZeroEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "VaultZeroEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "payload" JSONB NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "vaultZeroEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vaultZeroEvent_externalId_key" ON "vaultZeroEvent"("externalId");
CREATE INDEX "vaultZeroEvent_eventType_receivedAt_idx" ON "vaultZeroEvent"("eventType", "receivedAt");
CREATE INDEX "vaultZeroEvent_status_receivedAt_idx" ON "vaultZeroEvent"("status", "receivedAt");
