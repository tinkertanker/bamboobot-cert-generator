CREATE TABLE "RateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "resetAt" INTEGER NOT NULL
);
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");
