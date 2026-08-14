CREATE TABLE "acquisitionTargetCreateRequest" (
    "idempotencyKey" UUID NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acquisitionTargetCreateRequest_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE UNIQUE INDEX "acquisitionTargetCreateRequest_companyId_key" ON "acquisitionTargetCreateRequest"("companyId");

ALTER TABLE "acquisitionTargetCreateRequest" ADD CONSTRAINT "acquisitionTargetCreateRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
