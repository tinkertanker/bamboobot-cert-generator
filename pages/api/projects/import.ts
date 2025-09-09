import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';
import prisma from '@/lib/server/prisma';

// Accepts array of local SavedProject-like objects and imports to DB
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }

  const { projects } = req.body ?? {};
  if (!Array.isArray(projects)) { res.status(400).json({ error: 'projects array required' }); return; }

  try {
    const ops = projects.map((p: any) => {
      const name: string = (p?.name ?? 'Imported Project').toString().trim();
      const clientProjectId: string | null = p?.id ? String(p.id) : null;
      // Keep entire payload in data for compatibility
      const data = p ?? {};
      return prisma.project.upsert({
        where: {
          // Prefer clientProjectId matching; fallback to name uniqueness
          id: '', // will be unused; we use composite check via name + owner in below create
        },
        update: {}, // unreachable; using createMany-like semantics via create or ignore
        create: { ownerId: userId, name, data, clientProjectId, importSource: 'localStorage' },
      });
    });

    // Upsert in sequence to honor unique (ownerId, name)
    const created: any[] = [];
    for (const op of ops) {
      try {
        created.push(await op);
      } catch (e: any) {
        if (e?.code === 'P2002') {
          // duplicate name for this user; append suffix
          const base = (op as any)?.args?.create?.name || 'Imported Project';
          const data = (op as any)?.args?.create?.data || {};
          const clientProjectId = (op as any)?.args?.create?.clientProjectId || null;
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
