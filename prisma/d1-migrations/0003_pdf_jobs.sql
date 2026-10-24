CREATE TABLE "PdfJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "PdfJob_owner_status_idx" ON "PdfJob"("ownerId", "status");
CREATE INDEX "PdfJob_ready_idx" ON "PdfJob"("status", "leaseUntil");
CREATE INDEX "PdfJob_expires_idx" ON "PdfJob"("expiresAt");
