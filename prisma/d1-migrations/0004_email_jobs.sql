CREATE TABLE "EmailJob" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "policy" TEXT NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "expiresAt" INTEGER NOT NULL
);
CREATE INDEX "EmailJob_expiry_idx" ON "EmailJob"("expiresAt");
CREATE TABLE "EmailSubmission" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "jobId" TEXT NOT NULL REFERENCES "EmailJob"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL
);
CREATE TABLE "EmailItem" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "jobId" TEXT NOT NULL REFERENCES "EmailJob"("id") ON DELETE CASCADE,
  "submissionId" TEXT NOT NULL REFERENCES "EmailSubmission"("id"),
  "recipients" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "payloadKey" TEXT NOT NULL,
  "attachmentBytes" INTEGER NOT NULL,
  "quotaDay" TEXT NOT NULL,
  "quotaLimit" INTEGER,
  "quotaTier" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" INTEGER NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "providerId" TEXT
);
CREATE INDEX "EmailItem_ready_idx" ON "EmailItem"("status", "availableAt");
CREATE INDEX "EmailItem_job_idx" ON "EmailItem"("jobId");
CREATE TABLE "EmailProviderWindow" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "window" INTEGER NOT NULL,
  "used" INTEGER NOT NULL,
  "cooldownUntil" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "EmailIngestion" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL
);

-- Admission and quota charging are part of the SAME D1 transaction as the
-- submission/items. A crash cannot reserve quota without persisting its work.
CREATE TRIGGER "EmailItem_admit" BEFORE INSERT ON "EmailItem" BEGIN
  SELECT RAISE(ABORT, 'EMAIL_QUEUE_CANCELLED') WHERE (SELECT "status" FROM "EmailJob" WHERE "id"=NEW."jobId")='cancelled';
  SELECT RAISE(ABORT, 'EMAIL_QUEUE_CAPACITY') WHERE
    (SELECT count(*) FROM "EmailJob" WHERE "status" IN ('idle','processing','paused')) >
      (SELECT json_extract("policy", '$.activeGlobal') FROM "EmailJob" WHERE "id" = NEW."jobId") OR
    (SELECT count(*) FROM "EmailJob" WHERE "status" IN ('idle','processing','paused') AND "ownerId" =
      (SELECT "ownerId" FROM "EmailJob" WHERE "id" = NEW."jobId")) >
      (SELECT json_extract("policy", '$.activePerUser') FROM "EmailJob" WHERE "id" = NEW."jobId");
  SELECT RAISE(ABORT, 'EMAIL_SESSION_LIMIT') WHERE
    (SELECT count(*) FROM "EmailItem" WHERE "jobId" = NEW."jobId") >= 500 OR
    coalesce((SELECT sum("recipientCount") FROM "EmailItem" WHERE "jobId" = NEW."jobId"), 0) + NEW."recipientCount" > 500;
  SELECT RAISE(ABORT, 'EMAIL_ATTACHMENT_CAPACITY') WHERE
    coalesce((SELECT sum("attachmentBytes") FROM "EmailItem" WHERE "jobId" = NEW."jobId" AND "status" IN ('pending','sending')),0) + NEW."attachmentBytes" >
      (SELECT json_extract("policy", '$.queueBytes') FROM "EmailJob" WHERE "id" = NEW."jobId") OR
    coalesce((SELECT sum("attachmentBytes") FROM "EmailItem" WHERE "status" IN ('pending','sending')),0) + NEW."attachmentBytes" >
      (SELECT json_extract("policy", '$.globalBytes') FROM "EmailJob" WHERE "id" = NEW."jobId") OR
    coalesce((SELECT sum(i."attachmentBytes") FROM "EmailItem" i JOIN "EmailJob" j ON j."id"=i."jobId" WHERE i."status" IN ('pending','sending') AND j."ownerId"=
      (SELECT "ownerId" FROM "EmailJob" WHERE "id"=NEW."jobId")),0) + NEW."attachmentBytes" >
      (SELECT json_extract("policy", '$.userBytes') FROM "EmailJob" WHERE "id"=NEW."jobId");
  UPDATE "User" SET "dailyEmailCount"="dailyEmailCount"+NEW."recipientCount", "lifetimeEmailCount"="lifetimeEmailCount"+NEW."recipientCount"
    WHERE "id"=(SELECT "ownerId" FROM "EmailJob" WHERE "id"=NEW."jobId") AND "tier"=NEW."quotaTier" AND "lastUsageReset"=NEW."quotaDay"
      AND (NEW."quotaLimit" IS NULL OR "dailyEmailCount"+NEW."recipientCount"<=NEW."quotaLimit");
  SELECT RAISE(ABORT, 'EMAIL_QUOTA_CHANGED') WHERE changes() != 1;
END;

-- A terminal row is immutable. Replayed compensation cannot refund twice.
CREATE TRIGGER "EmailItem_transition" BEFORE UPDATE OF "status" ON "EmailItem"
WHEN OLD."status" != NEW."status" BEGIN
  SELECT RAISE(ABORT, 'EMAIL_INVALID_TRANSITION') WHERE NOT (
    (OLD."status"='pending' AND NEW."status" IN ('sending','refunded')) OR
    (OLD."status"='sending' AND NEW."status" IN ('sent','unknown','refunded','pending'))
  );
END;
CREATE TRIGGER "EmailItem_refund" AFTER UPDATE OF "status" ON "EmailItem"
WHEN OLD."status" != 'refunded' AND NEW."status"='refunded' BEGIN
  UPDATE "User" SET
    "dailyEmailCount"=CASE WHEN date("lastUsageReset")=date(NEW."quotaDay") THEN max(0,"dailyEmailCount"-NEW."recipientCount") ELSE "dailyEmailCount" END,
    "lifetimeEmailCount"=max(0,"lifetimeEmailCount"-NEW."recipientCount")
    WHERE "id"=(SELECT "ownerId" FROM "EmailJob" WHERE "id"=NEW."jobId");
END;
