CREATE TYPE "OutreachStatus" AS ENUM ('CONTACTED', 'REPLIED', 'QUALIFIED', 'DEMO_BOOKED', 'PILOT', 'WON', 'LOST', 'BOUNCED', 'OPTED_OUT');

CREATE TABLE "outreachLead" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "vertical" TEXT,
    "status" "OutreachStatus" NOT NULL DEFAULT 'CONTACTED',
    "source" TEXT NOT NULL DEFAULT 'GMAIL',
    "sourceThreadId" TEXT,
    "lastSubject" TEXT,
    "lastNote" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastContactedAt" TIMESTAMP(3),
    "lastRespondedAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "companyId" TEXT,
    "contactId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreachLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outreachLead_email_key" ON "outreachLead"("email");
CREATE UNIQUE INDEX "outreachLead_contactId_key" ON "outreachLead"("contactId");
CREATE INDEX "outreachLead_status_lastContactedAt_idx" ON "outreachLead"("status", "lastContactedAt");
CREATE INDEX "outreachLead_companyId_status_idx" ON "outreachLead"("companyId", "status");
CREATE INDEX "outreachLead_ownerId_status_idx" ON "outreachLead"("ownerId", "status");

ALTER TABLE "outreachLead" ADD CONSTRAINT "outreachLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outreachLead" ADD CONSTRAINT "outreachLead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outreachLead" ADD CONSTRAINT "outreachLead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
