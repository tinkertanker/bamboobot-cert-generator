-- Independent of User/EmailJob cascades: bytes remain charged until R2 deletion
-- succeeds, including after an owner or queue is deleted.
CREATE TABLE "EmailPayloadReservation" (
  "token" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL CHECK ("bytes" > 0),
  "objectCount" INTEGER NOT NULL CHECK ("objectCount" BETWEEN 1 AND 500),
  "state" TEXT NOT NULL CHECK ("state" IN ('staging','admitted','deleting')),
  "expiresAt" INTEGER NOT NULL
);
CREATE INDEX "EmailPayloadReservation_owner_idx" ON "EmailPayloadReservation"("ownerId");
CREATE INDEX "EmailPayloadReservation_job_idx" ON "EmailPayloadReservation"("jobId");
CREATE INDEX "EmailPayloadReservation_cleanup_idx" ON "EmailPayloadReservation"("state", "expiresAt");
CREATE INDEX "EmailSubmission_token_idx" ON "EmailSubmission"("token");
CREATE INDEX "EmailItem_payload_idx" ON "EmailItem"("payloadKey");

CREATE TRIGGER "EmailSubmission_reserved" BEFORE INSERT ON "EmailSubmission" BEGIN
  SELECT RAISE(ABORT, 'EMAIL_PAYLOAD_EXPIRED') WHERE NOT EXISTS (
    SELECT 1 FROM "EmailPayloadReservation" WHERE "token"=NEW."token"
      AND "jobId"=NEW."jobId" AND "state"='admitted'
  );
END;
