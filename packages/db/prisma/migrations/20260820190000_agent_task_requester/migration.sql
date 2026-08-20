ALTER TABLE "agentTask" ADD COLUMN "requestedById" TEXT;

ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agentTask_requestedById_idx" ON "agentTask"("requestedById");
