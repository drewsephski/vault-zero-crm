ALTER TABLE "acquisitionProfile" ADD COLUMN "buyBoxRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "acquisitionCandidate" ADD COLUMN "dismissedAt" TIMESTAMP(3);
ALTER TABLE "acquisitionCandidate" ADD COLUMN "dismissedBuyBoxRevision" INTEGER;
ALTER TABLE "acquisitionCandidate" ADD COLUMN "dismissedReason" TEXT;
