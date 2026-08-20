CREATE TYPE "AcquisitionResearchRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "acquisitionResearchRun"
  ADD COLUMN "status" "AcquisitionResearchRunStatus" NOT NULL DEFAULT 'RUNNING',
  ADD COLUMN "agentTaskId" TEXT,
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "outcome" TEXT;

CREATE UNIQUE INDEX "acquisitionResearchRun_agentTaskId_key"
  ON "acquisitionResearchRun"("agentTaskId");
