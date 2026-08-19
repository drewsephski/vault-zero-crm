INSERT INTO "organization" ("id", "name", "slug", "createdAt")
SELECT 'workspace', 'Vault Zero', 'workspace', NOW()
WHERE NOT EXISTS (SELECT 1 FROM "organization" WHERE "id" = 'workspace');

ALTER TABLE "company" ADD COLUMN "organizationId" TEXT;
UPDATE "company" SET "organizationId" = 'workspace' WHERE "organizationId" IS NULL;
ALTER TABLE "company" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "contact" ADD COLUMN "organizationId" TEXT;
UPDATE "contact" SET "organizationId" = 'workspace' WHERE "organizationId" IS NULL;
ALTER TABLE "contact" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "deal" ADD COLUMN "organizationId" TEXT;
UPDATE "deal" SET "organizationId" = 'workspace' WHERE "organizationId" IS NULL;
ALTER TABLE "deal" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "agentTask" ADD COLUMN "organizationId" TEXT;
UPDATE "agentTask" SET "organizationId" = 'workspace' WHERE "organizationId" IS NULL;
ALTER TABLE "agentTask" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "acquisitionCandidate" ADD COLUMN "organizationId" TEXT;
UPDATE "acquisitionCandidate" SET "organizationId" = 'workspace' WHERE "organizationId" IS NULL;
ALTER TABLE "acquisitionCandidate" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "outreachLead" ADD COLUMN "organizationId" TEXT;
UPDATE "outreachLead" SET "organizationId" = 'workspace' WHERE "organizationId" IS NULL;
ALTER TABLE "outreachLead" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "agentConversation" ADD COLUMN "organizationId" TEXT;
UPDATE "agentConversation" SET "organizationId" = 'workspace' WHERE "organizationId" IS NULL;
ALTER TABLE "agentConversation" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX IF EXISTS "company_domain_key";
DROP INDEX IF EXISTS "contact_email_key";
DROP INDEX IF EXISTS "acquisitionCandidate_domain_key";
DROP INDEX IF EXISTS "outreachLead_email_key";

CREATE UNIQUE INDEX "company_organizationId_domain_key" ON "company"("organizationId", "domain");
CREATE INDEX "company_organizationId_idx" ON "company"("organizationId");
ALTER TABLE "company" ADD CONSTRAINT "company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "contact_organizationId_email_key" ON "contact"("organizationId", "email");
CREATE INDEX "contact_organizationId_idx" ON "contact"("organizationId");
ALTER TABLE "contact" ADD CONSTRAINT "contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "deal_organizationId_idx" ON "deal"("organizationId");
ALTER TABLE "deal" ADD CONSTRAINT "deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agentTask_organizationId_dueAt_leasedUntil_idx" ON "agentTask"("organizationId", "dueAt", "leasedUntil");
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "acquisitionCandidate_organizationId_domain_key" ON "acquisitionCandidate"("organizationId", "domain");
CREATE INDEX "acquisitionCandidate_organizationId_status_createdAt_idx" ON "acquisitionCandidate"("organizationId", "status", "createdAt");
ALTER TABLE "acquisitionCandidate" ADD CONSTRAINT "acquisitionCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "outreachLead_organizationId_email_key" ON "outreachLead"("organizationId", "email");
CREATE INDEX "outreachLead_organizationId_status_lastContactedAt_idx" ON "outreachLead"("organizationId", "status", "lastContactedAt");
ALTER TABLE "outreachLead" ADD CONSTRAINT "outreachLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agentConversation_organizationId_lastMessageAt_idx" ON "agentConversation"("organizationId", "lastMessageAt");
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
