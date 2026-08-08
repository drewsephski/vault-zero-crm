CREATE TYPE "WorkspaceMode" AS ENUM ('SALES', 'ACQUISITION');

CREATE TYPE "AcquisitionOwnerInvolvement" AS ENUM ('PASSIVE', 'TRANSITIONAL', 'OPERATOR');

CREATE TYPE "AcquisitionRevenuePreference" AS ENUM ('REQUIRED', 'PREFERRED', 'OPTIONAL');

CREATE TYPE "AcquisitionAssetPreference" AS ENUM ('ASSET_LIGHT', 'BALANCED', 'ASSET_HEAVY');

CREATE TABLE "acquisitionProfile" (
    "id" TEXT NOT NULL,
    "mode" "WorkspaceMode" NOT NULL DEFAULT 'SALES',
    "preferredIndustries" TEXT[] NOT NULL,
    "geographies" TEXT[] NOT NULL,
    "excludedCategories" TEXT[] NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "revenueMin" DECIMAL(18,2),
    "revenueMax" DECIMAL(18,2),
    "ebitdaMin" DECIMAL(18,2),
    "ebitdaMax" DECIMAL(18,2),
    "purchasePriceMin" DECIMAL(18,2),
    "purchasePriceMax" DECIMAL(18,2),
    "ownerInvolvement" "AcquisitionOwnerInvolvement",
    "recurringRevenuePreference" "AcquisitionRevenuePreference",
    "customerConcentrationMax" INTEGER,
    "assetPreference" "AcquisitionAssetPreference",
    "financingAssumptions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acquisitionProfile_pkey" PRIMARY KEY ("id")
);
