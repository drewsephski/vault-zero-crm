ALTER TYPE "RecordSource" ADD VALUE 'DISCOVERY';

ALTER TABLE "acquisitionProfile" ALTER COLUMN "mode" SET DEFAULT 'ACQUISITION';

CREATE TYPE "AcquisitionStage" AS ENUM ('DISCOVERED', 'RESEARCHING', 'QUALIFIED', 'WATCHLIST', 'CONTACTED', 'INTERESTED', 'OPPORTUNITY', 'DILIGENCE', 'REJECTED', 'ACQUIRED');

CREATE TYPE "AcquisitionFit" AS ENUM ('UNKNOWN', 'STRONG', 'POTENTIAL', 'WEAK', 'DISQUALIFIED');

CREATE TYPE "AcquisitionCandidateStatus" AS ENUM ('PROPOSED', 'APPROVED', 'DISMISSED', 'DUPLICATE');

CREATE TABLE "acquisitionCandidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "status" "AcquisitionCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "companyId" TEXT,
    "sourceSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "acquisitionCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acquisitionTarget" (
    "companyId" TEXT NOT NULL,
    "stage" "AcquisitionStage" NOT NULL DEFAULT 'DISCOVERED',
    "fit" "AcquisitionFit" NOT NULL DEFAULT 'UNKNOWN',
    "summary" TEXT,
    "strengths" JSONB NOT NULL,
    "concerns" JSONB NOT NULL,
    "missingInformation" TEXT[],
    "recommendedAction" TEXT,
    "recommendedStage" "AcquisitionStage",
    "sourceUrls" TEXT[],
    "researchedAt" TIMESTAMP(3),
    "sourceSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "acquisitionTarget_pkey" PRIMARY KEY ("companyId")
);

CREATE UNIQUE INDEX "acquisitionCandidate_domain_key" ON "acquisitionCandidate"("domain");

CREATE UNIQUE INDEX "acquisitionCandidate_companyId_key" ON "acquisitionCandidate"("companyId");

CREATE INDEX "acquisitionCandidate_status_createdAt_idx" ON "acquisitionCandidate"("status", "createdAt");

CREATE INDEX "acquisitionTarget_stage_fit_idx" ON "acquisitionTarget"("stage", "fit");

CREATE INDEX "acquisitionTarget_researchedAt_idx" ON "acquisitionTarget"("researchedAt");

ALTER TABLE "acquisitionCandidate" ADD CONSTRAINT "acquisitionCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "acquisitionTarget" ADD CONSTRAINT "acquisitionTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
