import type { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/server/prisma';
import { detectUserTier } from '@/lib/server/tiers';
import { getTierLimits, type UserTier } from '@/types/user';

/** A single SQLite/D1 statement owns capacity and import replay admission. */
export async function createProjectWithinLimit(ownerId: string, input: {
  name: string; data: Prisma.InputJsonValue; clientProjectId: string | null; importSource?: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!user) return null;
  const tier = detectUserTier(user.email, user.tier as UserTier, user.tierSource === 'manual' ? 'manual' : 'env');
  const limit = getTierLimits(tier).projectLimit;
  const id = uuidv4();
  const now = new Date().toISOString();
  let inserted: number;
  try {
    inserted = await prisma.$executeRaw`
      INSERT INTO Project (id,ownerId,name,data,clientProjectId,importSource,createdAt,updatedAt)
      SELECT ${id},${ownerId},${input.name},${JSON.stringify(input.data)},${input.clientProjectId},${input.importSource ?? null},${now},${now}
      FROM User WHERE id=${ownerId} AND tier=${user.tier} AND tierSource=${user.tierSource}
      AND (${limit} IS NULL OR (SELECT COUNT(*) FROM Project WHERE ownerId=${ownerId}) < ${limit})
      AND (${input.clientProjectId} IS NULL OR NOT EXISTS (
        SELECT 1 FROM Project WHERE ownerId=${ownerId} AND clientProjectId=${input.clientProjectId}
      ))`;
  } catch (error) {
    // Preserve the routes' existing name-conflict handling for raw SQL writes.
    if (String(error).includes('UNIQUE constraint failed: Project.ownerId, Project.name')) {
      throw Object.assign(new Error('Project name already exists'), { code: 'P2002' });
    }
    throw error;
  }
  const project = inserted
    ? await prisma.project.findUnique({ where: { id } })
    : input.clientProjectId !== null
      ? await prisma.project.findFirst({ where: { ownerId, clientProjectId: input.clientProjectId } })
      : null;
  return project ? { project, created: inserted === 1 } : null;
}
