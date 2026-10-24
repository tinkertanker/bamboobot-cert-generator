-- Additive only. Existing users, projects, email/PDF jobs and R2 are unchanged.
CREATE TABLE AgentKey (
  id TEXT PRIMARY KEY NOT NULL, ownerId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  label TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE, scopes JSONB NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expiresAt DATETIME NOT NULL,
  lastUsedAt DATETIME, revokedAt DATETIME
);
CREATE INDEX AgentKey_ownerId_idx ON AgentKey(ownerId);
CREATE TABLE CertificateJob (
  id TEXT PRIMARY KEY NOT NULL, ownerId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  label TEXT NOT NULL, idempotencyKey TEXT NOT NULL, inputHash TEXT NOT NULL, rendererVersion TEXT NOT NULL,
  input JSONB NOT NULL, sampleHash TEXT NOT NULL, total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_approval', approvedAt DATETIME,
  attempts INTEGER NOT NULL DEFAULT 0, attemptToken TEXT, leaseUntil DATETIME, retryAt DATETIME,
  progress INTEGER NOT NULL DEFAULT 0, error TEXT, manifest JSONB, checkpoint JSONB,
  storageBytes INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expiresAt DATETIME NOT NULL,
  UNIQUE(ownerId,idempotencyKey)
);
CREATE INDEX CertificateJob_status_retryAt_idx ON CertificateJob(status,retryAt);
CREATE INDEX CertificateJob_ownerId_idx ON CertificateJob(ownerId);
CREATE TRIGGER CertificateJob_admit BEFORE INSERT ON CertificateJob BEGIN
  SELECT RAISE(ABORT,'AGENT_CAPACITY') WHERE
    (SELECT count(*) FROM CertificateJob WHERE status IN ('ingesting','preparing','awaiting_approval','queued','running') AND julianday(expiresAt)>julianday('now') AND ownerId=NEW.ownerId)>=3 OR
    (SELECT count(*) FROM CertificateJob WHERE status IN ('ingesting','preparing','awaiting_approval','queued','running') AND julianday(expiresAt)>julianday('now'))>=8 OR
    (SELECT coalesce(sum(storageBytes),0) FROM CertificateJob WHERE status!='expired' AND julianday(expiresAt)>julianday('now'))+NEW.storageBytes>2147483648;
END;
-- Quota charging cannot be separated from the successful state transition.
-- Keep the free-tier batch allowance in agreement with types/user.ts (10/day).
CREATE TRIGGER CertificateJob_approve BEFORE UPDATE OF status ON CertificateJob
WHEN OLD.status='awaiting_approval' AND NEW.status='queued' BEGIN
  SELECT RAISE(ABORT,'AGENT_QUOTA') WHERE julianday(OLD.expiresAt)<=julianday('now');
  UPDATE User SET dailyPdfCount=0,dailyEmailCount=0,lastUsageReset=strftime('%Y-%m-%dT%H:%M:%f+00:00','now')
    WHERE id=NEW.ownerId AND date(lastUsageReset)<date('now');
  UPDATE User SET dailyPdfCount=dailyPdfCount+1,lifetimePdfCount=lifetimePdfCount+1 WHERE id=NEW.ownerId
    AND (tier IN ('plus','admin','super_admin') OR (tier='free' AND dailyPdfCount<10));
  SELECT RAISE(ABORT,'AGENT_QUOTA') WHERE changes()!=1;
END;
