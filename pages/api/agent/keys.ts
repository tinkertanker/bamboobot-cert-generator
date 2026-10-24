import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/server/prisma';
import { principal, createKey, respondError } from '@/lib/agent/auth';
import { AgentError } from '@/lib/agent/input';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const ownerId = await principal(req, res, 'certificates:read', true);
    if (req.method === 'GET') {
      const keys = await prisma.agentKey.findMany({ where: { ownerId }, select: { id: true, label: true, scopes: true, expiresAt: true, lastUsedAt: true, revokedAt: true }, orderBy: { createdAt: 'desc' } });
      return res.json({ keys });
    }
    if (req.method === 'POST') return res.status(201).json(await createKey(ownerId, req.body?.label, req.body?.scopes));
    if (req.method === 'DELETE') {
      if (typeof req.query.id !== 'string') throw new AgentError('API key id required');
      const result = await prisma.agentKey.updateMany({ where: { id: req.query.id, ownerId }, data: { revokedAt: new Date() } });
      if (!result.count) throw new AgentError('API key not found', 404);
      return res.json({ revoked: true });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { respondError(res, e); }
}
