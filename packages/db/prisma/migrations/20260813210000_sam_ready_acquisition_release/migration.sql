ALTER TABLE "acquisitionTarget" ADD COLUMN "criteria" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "agentTask" ADD COLUMN "lastError" TEXT;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "kind", COALESCE("contactId", ''), COALESCE("companyId", '')
    ORDER BY "priority" DESC, "dueAt" ASC, "createdAt" ASC
  ) AS position
  FROM "agentTask"
  WHERE "finishedAt" IS NULL
)
UPDATE "agentTask"
SET "finishedAt" = CURRENT_TIMESTAMP,
    "outcome" = 'Superseded while enforcing active-task uniqueness'
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX "agentTask_active_subject_kind_key"
ON "agentTask" ("kind", COALESCE("contactId", ''), COALESCE("companyId", ''))
WHERE "finishedAt" IS NULL;
