UPDATE "acquisitionTarget"
SET "recommendedStage" = NULL
WHERE "recommendedStage"::text IN (
  'RESEARCHING',
  'CONTACTED',
  'INTERESTED',
  'OPPORTUNITY',
  'DILIGENCE'
);

CREATE TYPE "AcquisitionStage_new" AS ENUM (
  'DISCOVERED',
  'QUALIFIED',
  'WATCHLIST',
  'REJECTED',
  'ACQUIRED'
);

ALTER TABLE "acquisitionTarget"
  ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "acquisitionTarget"
  ALTER COLUMN "stage" TYPE "AcquisitionStage_new"
  USING ("stage"::text::"AcquisitionStage_new");

ALTER TABLE "acquisitionTarget"
  ALTER COLUMN "stage" SET DEFAULT 'DISCOVERED'::"AcquisitionStage_new";

ALTER TABLE "acquisitionTarget"
  ALTER COLUMN "recommendedStage" TYPE "AcquisitionStage_new"
  USING (
    CASE
      WHEN "recommendedStage" IS NULL THEN NULL
      ELSE "recommendedStage"::text::"AcquisitionStage_new"
    END
  );

DROP TYPE "AcquisitionStage";

ALTER TYPE "AcquisitionStage_new" RENAME TO "AcquisitionStage";
