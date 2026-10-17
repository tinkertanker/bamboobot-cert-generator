-- Track whether a user's tier came from the env admin lists or a manual grant,
-- so env-granted admin tiers can be revoked when removed from the env.
ALTER TABLE "User" ADD COLUMN "tierSource" TEXT NOT NULL DEFAULT 'env';
