import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';
import prisma from '@/lib/server/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;
  const { id } = req.query as { id: string };

  if (!id) { res.status(400).json({ error: 'id is required' }); return; }

  if (req.method === 'GET') {
    const project = await prisma.project.findFirst({ where: { id, ownerId: userId } });
    if (!project) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(200).json({ project });
    return;
  }

  if (req.method === 'PUT') {
    const { name, data } = req.body ?? {};
    try {
      const updated = await prisma.project.update({
        where: { id },
        data: { name: name ? String(name).trim() : undefined, data: data ?? undefined },
      });
      if (updated.ownerId !== userId) { res.status(403).json({ error: 'Forbidden' }); return; }
      res.status(200).json({ project: updated });
      return;
    } catch (e: any) {
      if (e?.code === 'P2025') { res.status(404).json({ error: 'Not found' }); return; }
      if (e?.code === 'P2002') { res.status(409).json({ error: 'Project name already exists' }); return; }
      console.error('Update project error:', e);
      res.status(500).json({ error: 'Failed to update project' });
      return;
    }
  }

  if (req.method === 'DELETE') {
    try {
      const existing = await prisma.project.findUnique({ where: { id } });
      if (!existing || existing.ownerId !== userId) { res.status(404).json({ error: 'Not found' }); return; }
      await prisma.project.delete({ where: { id } });
      res.status(204).end();
      return;
    } catch (e) {
      console.error('Delete project error:', e);
      res.status(500).json({ error: 'Failed to delete project' });
      return;
    }
  }

  res.setHeader('Allow', 'GET,PUT,DELETE');
  res.status(405).end();
  return;
}
