ALTER TABLE "acquisitionProfile" ADD COLUMN "criterionWeights" JSONB;

ALTER TABLE "acquisitionEngagement" ADD COLUMN "sellerDiscretionaryEarnings" DECIMAL(18,2);
ALTER TABLE "acquisitionEngagement" ADD COLUMN "ebitdaMultiple" DECIMAL(8,2);
ALTER TABLE "acquisitionEngagement" ADD COLUMN "equityInjection" DECIMAL(18,2);
ALTER TABLE "acquisitionEngagement" ADD COLUMN "sbaLoanAmount" DECIMAL(18,2);
ALTER TABLE "acquisitionEngagement" ADD COLUMN "dscr" DECIMAL(8,4);
ALTER TABLE "acquisitionEngagement" ADD COLUMN "workingCapitalNeed" DECIMAL(18,2);

CREATE TABLE "acquisitionResearchRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'workspace',
  "companyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "triggeredById" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "dossierSnapshot" JSONB,
  CONSTRAINT "acquisitionResearchRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "acquisitionResearchRun_organizationId_companyId_startedAt_idx"
  ON "acquisitionResearchRun"("organizationId", "companyId", "startedAt");

ALTER TABLE "acquisitionResearchRun"
  ADD CONSTRAINT "acquisitionResearchRun_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "acquisitionResearchRun"
  ADD CONSTRAINT "acquisitionResearchRun_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "acquisitionResearchRun"
  ADD CONSTRAINT "acquisitionResearchRun_triggeredById_fkey"
  FOREIGN KEY ("triggeredById") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
