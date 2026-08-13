UPDATE "member"
SET "role" = 'owner'
WHERE "id" = (
  SELECT "member"."id"
  FROM "member"
  JOIN "user" ON "user"."id" = "member"."userId"
  WHERE "member"."organizationId" = 'workspace'
  ORDER BY "user"."createdAt" ASC, "member"."userId" ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM "member"
  WHERE "organizationId" = 'workspace' AND "role" = 'owner'
);
