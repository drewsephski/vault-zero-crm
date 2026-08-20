CREATE TYPE "EmailSendStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "emailSend" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "EmailSendStatus" NOT NULL DEFAULT 'PENDING',
    "to" JSONB NOT NULL,
    "cc" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "crmThreadId" TEXT,
    "gmailThreadId" TEXT,
    "gmailMessageId" TEXT,
    "rfcMessageId" TEXT NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "emailSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emailSend_idempotencyKey_key" ON "emailSend"("idempotencyKey");
CREATE INDEX "emailSend_organizationId_createdAt_idx" ON "emailSend"("organizationId", "createdAt");
CREATE INDEX "emailSend_userId_status_createdAt_idx" ON "emailSend"("userId", "status", "createdAt");

ALTER TABLE "emailSend" ADD CONSTRAINT "emailSend_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emailSend" ADD CONSTRAINT "emailSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
