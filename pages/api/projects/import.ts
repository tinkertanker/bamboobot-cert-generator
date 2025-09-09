import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';
import prisma from '@/lib/server/prisma';
import type { Prisma } from '@prisma/client';

// Accepts array of local SavedProject-like objects and imports to DB
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as { id: string }).id;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }

  const { projects } = req.body ?? {};
  if (!Array.isArray(projects)) { res.status(400).json({ error: 'projects array required' }); return; }

  try {
    const ops = projects.map((p: unknown) => {
      const project = p as Record<string, unknown>;
      const name: string = (project?.name ?? 'Imported Project').toString().trim();
      const clientProjectId: string | null = project?.id ? String(project.id) : null;
      // Keep entire payload in data for compatibility
      const data = project ?? {};
      return prisma.project.create({
        data: { ownerId: userId, name, data, clientProjectId, importSource: 'localStorage' },
      });
    });

    // Create in sequence to honor unique (ownerId, name)
    const created: Prisma.ProjectGetPayload<Record<string, never>>[] = [];
    for (const op of ops) {
      try {
        created.push(await op);
      } catch (e) {
        const error = e as { code?: string };
        if (error?.code === 'P2002') {
          // duplicate name for this user; append suffix
          const createArgs = (op as { args?: { data?: { name?: string; data?: unknown; clientProjectId?: string | null } } })?.args?.data;
          const base = createArgs?.name || 'Imported Project';
          const data = createArgs?.data || {};
          const clientProjectId = createArgs?.clientProjectId || null;
          const alt = `${base} (Imported ${new Date().toISOString().slice(0,10)})`;
          created.push(await prisma.project.create({ data: { ownerId: userId, name: alt, data, clientProjectId, importSource: 'localStorage' } }));
        } else {
          throw e;
        }
      }
    }

    res.status(200).json({ imported: created.length });
    return;
  } catch (e) {
    console.error('Import projects error:', e);
    res.status(500).json({ error: 'Failed to import projects' });
    return;
  }
}
