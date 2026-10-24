import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/server/prisma';
import { principal, respondError } from '@/lib/agent/auth';
import { createDraft, describeJob } from '@/lib/agent/jobs';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const ownerId = await principal(req, res, req.method === 'POST' ? 'certificates:write' : 'certificates:read');
    if (req.method === 'GET') {
      const jobs = await prisma.certificateJob.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' }, take: 50,
        select: { id: true, label: true, status: true, total: true, progress: true, createdAt: true, expiresAt: true, approvedAt: true, error: true, attempts: true } });
      return res.json({ jobs });
    }
    if (req.method === 'POST') {
      const { job, created } = await createDraft(ownerId, req.body, String(req.headers['idempotency-key'] ?? ''));
      return res.status(created ? 201 : 200).json({ job: describeJob(job) });
    }
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { respondError(res, e); }
}
