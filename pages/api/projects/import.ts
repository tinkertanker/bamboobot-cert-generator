import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';
import prisma from '@/lib/server/prisma';
import type { Prisma } from '@prisma/client';
import { getRemainingProjectAllowance } from '@/lib/server/tiers';
import { createProjectWithinLimit } from '@/lib/server/project-admission';

const MAX_IMPORT_PROJECTS = 100;
const MAX_PROJECT_NAME_LENGTH = 200;

// Accepts array of local SavedProject-like objects and imports to DB
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }

  const { projects } = req.body ?? {};
  if (!Array.isArray(projects)) { res.status(400).json({ error: 'projects array required' }); return; }
  if (projects.length > MAX_IMPORT_PROJECTS) {
    res.status(400).json({ error: `Cannot import more than ${MAX_IMPORT_PROJECTS} projects at once` });
    return;
  }
  if (!projects.every((p: unknown) => p !== null && typeof p === 'object' && !Array.isArray(p))) {
    res.status(400).json({ error: 'Each project must be an object' });
    return;
  }
  if (projects.some((p: { id?: unknown }) => typeof p.id === 'string' && (!p.id.trim() || p.id.length > 200))) {
    res.status(400).json({ error: 'Project id must contain 1 to 200 characters' });
    return;
  }

  try {
    const inputs = projects.map((p: unknown) => {
      const project = p as Record<string, unknown>;
      const rawName = typeof project.name === 'string' ? project.name.trim() : '';
      const name: string = (rawName || 'Imported Project').slice(0, MAX_PROJECT_NAME_LENGTH);
      const clientProjectId: string | null =
        typeof project.id === 'string' || typeof project.id === 'number' ? String(project.id) : null;
      // Keep entire payload in data for compatibility - must be JSON-serializable
      const data = JSON.parse(JSON.stringify(project)) as Prisma.InputJsonValue;
      return { name, data, clientProjectId };
    });

    // Projects imported by an earlier attempt are confirmed without being
    // created again, so a retry after a partial failure makes no duplicates.
    const importedIds: string[] = [];
    const toCreate: typeof inputs = [];
    for (const input of inputs) {
      if (input.clientProjectId) {
        const existing = await prisma.project.findFirst({
          where: { ownerId: userId, clientProjectId: input.clientProjectId },
          select: { id: true },
        });
        if (existing) {
          importedIds.push(input.clientProjectId);
          continue;
        }
      }
      toCreate.push(input);
    }

    // Enforce the tier's project limit for the whole batch. Rejecting (rather
    // than importing a subset) keeps the client's local copies, which it only
    // clears once the server confirms them.
    const remaining = await getRemainingProjectAllowance(userId);
    if (remaining !== null && toCreate.length > remaining) {
      res.status(403).json({ error: 'Project limit reached for your plan', code: 'LIMIT_REACHED', importedIds });
      return;
    }

    // Create in sequence to honor unique (ownerId, name)
    let imported = 0;
    for (const input of toCreate) {
      const create = (name: string) => createProjectWithinLimit(userId, { ...input, name, importSource: 'localStorage' });
      let admitted;
      try {
        admitted = await create(input.name);
      } catch (e) {
        const error = e as { code?: string };
        if (error?.code !== 'P2002') throw e;
        // duplicate name for this user; append suffix
        admitted = await create(`${input.name} (Imported ${new Date().toISOString().slice(0, 10)})`);
      }
      if (!admitted) {
        // Capacity changed after the batch precheck. Acknowledge only durable
        // copies; unconfirmed browser projects remain available for retry.
        res.status(403).json({ error: 'Project limit reached for your plan', code: 'LIMIT_REACHED', imported, importedIds });
        return;
      }
      if (admitted.created) imported++;
      if (input.clientProjectId) importedIds.push(input.clientProjectId);
    }

    // importedIds lists the client ids now stored on the server; the client
    // deletes only those browser copies.
    res.status(200).json({ imported, importedIds });
    return;
  } catch (e) {
    console.error('Import projects error:', e);
    res.status(500).json({ error: 'Failed to import projects' });
    return;
  }
}
