ALTER TYPE "RecordSource" ADD VALUE 'VAULT_ZERO';

ALTER TABLE "vaultZeroEvent" ADD COLUMN "vapiCallId" TEXT;

CREATE TABLE "vaultZeroProposal" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "leadSubmissionId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaultZeroProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vaultZeroProposal_proposalId_key" ON "vaultZeroProposal"("proposalId");
CREATE INDEX "vaultZeroProposal_leadSubmissionId_idx" ON "vaultZeroProposal"("leadSubmissionId");
CREATE INDEX "vaultZeroProposal_companyId_idx" ON "vaultZeroProposal"("companyId");
CREATE INDEX "vaultZeroProposal_contactId_idx" ON "vaultZeroProposal"("contactId");
CREATE INDEX "vaultZeroProposal_dealId_idx" ON "vaultZeroProposal"("dealId");

CREATE UNIQUE INDEX "vaultZeroEvent_vapiCallId_key" ON "vaultZeroEvent"("vapiCallId");
