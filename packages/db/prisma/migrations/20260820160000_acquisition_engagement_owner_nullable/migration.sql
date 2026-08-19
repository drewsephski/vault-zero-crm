ALTER TABLE "acquisitionEngagement" DROP CONSTRAINT "acquisitionEngagement_ownerId_fkey";

ALTER TABLE "acquisitionEngagement" ALTER COLUMN "ownerId" DROP NOT NULL;

ALTER TABLE "acquisitionEngagement"
  ADD CONSTRAINT "acquisitionEngagement_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
