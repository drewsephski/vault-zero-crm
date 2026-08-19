INSERT INTO "acquisitionEngagement" (
  "id",
  "organizationId",
  "companyId",
  "ownerId",
  "stage",
  "status",
  "stageChangedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-engagement-' || t."companyId",
  co."organizationId",
  t."companyId",
  co."ownerId",
  CASE t."stage"
    WHEN 'INTERESTED' THEN 'ENGAGED'::"AcquisitionEngagementStage"
    WHEN 'DILIGENCE' THEN 'DILIGENCE'::"AcquisitionEngagementStage"
    ELSE 'OUTREACH'::"AcquisitionEngagementStage"
  END,
  'ACTIVE'::"AcquisitionEngagementStatus",
  t."updatedAt",
  t."createdAt",
  t."updatedAt"
FROM "acquisitionTarget" t
JOIN "company" co ON co."id" = t."companyId"
WHERE t."stage" IN ('CONTACTED', 'INTERESTED', 'OPPORTUNITY', 'DILIGENCE')
  AND NOT EXISTS (
    SELECT 1
    FROM "acquisitionEngagement" e
    WHERE e."companyId" = t."companyId"
      AND e."status" = 'ACTIVE'
  );

UPDATE "acquisitionTarget"
SET "stage" = 'DISCOVERED'
WHERE "stage" = 'RESEARCHING';

UPDATE "acquisitionTarget"
SET "stage" = 'QUALIFIED'
WHERE "stage" IN ('OPPORTUNITY', 'CONTACTED', 'INTERESTED', 'DILIGENCE');
