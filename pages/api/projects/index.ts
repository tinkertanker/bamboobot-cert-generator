import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';
import prisma from '@/lib/server/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;

  if (req.method === 'GET') {
    // List current user's projects with derived summary
    const items = await prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, createdAt: true, updatedAt: true, data: true },
    });
    const projects = items.map((p) => {
      const data: any = p.data || {};
      const columnsCount = Array.isArray(data?.columns)
        ? data.columns.length
        : (data?.positions ? Object.keys(data.positions || {}).length : 0);
      const rowsCount = Array.isArray(data?.tableData) ? data.tableData.length : 0;
      const hasEmailConfig = !!data?.emailConfig?.isConfigured;
      let imageStatus: 'available' | 'missing' | 'checking' = 'checking';
      if (data?.certificateImage?.isCloudStorage) imageStatus = 'available';
      else if (data?.certificateImage?.url) imageStatus = 'available';
      else imageStatus = 'missing';
      return {
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        columnsCount,
        rowsCount,
        hasEmailConfig,
        imageStatus,
      };
    });
    return res.status(200).json({ projects });
  }

  if (req.method === 'POST') {
    const { name, data, clientProjectId } = req.body ?? {};
    if (!name || !data) return res.status(400).json({ error: 'name and data are required' });

    try {
      const created = await prisma.project.create({
        data: { name: String(name).trim(), data, ownerId: userId, clientProjectId: clientProjectId ?? null },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });
      return res.status(201).json({ project: created });
    } catch (e: any) {
      // unique constraint on (ownerId, name)
      if (e?.code === 'P2002') return res.status(409).json({ error: 'Project name already exists' });
      console.error('Create project error:', e);
      return res.status(500).json({ error: 'Failed to create project' });
    }
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).end();
}
