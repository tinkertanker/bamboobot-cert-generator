import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { requireAuth } from '@/lib/auth/requireAuth';
import prisma from '@/lib/server/prisma';
import { createProjectWithinLimit } from '@/lib/server/project-admission';

const MAX_PROJECT_NAME_LENGTH = 200;

// Summaries are derived in SQLite/D1 so lists never ship whole recipient tables.
// Each expression reproduces the former JavaScript reading of the parsed JSON:
// a root that is not an object contributes nothing, and flags use JS truthiness.
// String positions are returned as-is: Object.keys counts their UTF-16 code
// units, which SQLite length() does not. Duplicate JSON keys (which
// JSON.stringify never writes) would resolve differently from JSON.parse.
const truthy = (path: string) => `(CASE json_type(data,'${path}')
  WHEN 'true' THEN 1 WHEN 'object' THEN 1 WHEN 'array' THEN 1
  WHEN 'integer' THEN json_extract(data,'${path}')!=0 WHEN 'real' THEN json_extract(data,'${path}')!=0
  WHEN 'text' THEN json_extract(data,'${path}')!='' ELSE 0 END)`;

const SUMMARY_COLUMNS = Prisma.raw(`
  CASE WHEN json_type(data,'$.columns')='array' THEN json_array_length(data,'$.columns')
    ELSE CASE json_type(data,'$.positions')
      WHEN 'object' THEN (SELECT count(*) FROM json_each(data,'$.positions'))
      WHEN 'array' THEN json_array_length(data,'$.positions') ELSE 0 END
  END AS columnsCount,
  CASE WHEN json_type(data,'$.columns') IS NOT 'array' AND json_type(data,'$.positions')='text'
    THEN json_extract(data,'$.positions') END AS positionsText,
  CASE WHEN json_type(data,'$.tableData')='array' THEN json_array_length(data,'$.tableData') ELSE 0 END AS rowsCount,
  ${truthy('$.emailConfig.isConfigured')} AS hasEmailConfig,
  (${truthy('$.certificateImage.isCloudStorage')} OR ${truthy('$.certificateImage.url')}) AS hasImage`);

interface ProjectSummaryRow {
  id: string; name: string; createdAt: Date; updatedAt: Date;
  columnsCount: number | bigint; positionsText: string | null; rowsCount: number | bigint;
  hasEmailConfig: number | bigint; hasImage: number | bigint;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;

  if (req.method === 'GET') {
    // List current user's projects with derived summary
    const items = await prisma.$queryRaw<ProjectSummaryRow[]>`
      SELECT id, name, createdAt, updatedAt, ${SUMMARY_COLUMNS}
      FROM Project WHERE ownerId=${userId} ORDER BY updatedAt DESC`;
    const projects = items.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      columnsCount: p.positionsText ? p.positionsText.length : Number(p.columnsCount),
      rowsCount: Number(p.rowsCount),
      hasEmailConfig: Number(p.hasEmailConfig) === 1,
      imageStatus: Number(p.hasImage) === 1 ? 'available' : 'missing',
    }));
    res.status(200).json({ projects });
    return;
  }

  if (req.method === 'POST') {
    const { name, data, clientProjectId } = req.body ?? {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || !data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'name and data are required' });
    }
    if (trimmedName.length > MAX_PROJECT_NAME_LENGTH) {
      return res.status(400).json({ error: 'Project name is too long' });
    }
    if (typeof clientProjectId === 'string' && (!clientProjectId.trim() || clientProjectId.length > 200)) {
      return res.status(400).json({ error: 'clientProjectId must contain 1 to 200 characters' });
    }

    try {
      const admitted = await createProjectWithinLimit(userId, {
        name: trimmedName, data,
        clientProjectId: typeof clientProjectId === 'string' ? clientProjectId : null,
      });
      if (!admitted) {
        res.status(403).json({ error: 'Project limit reached for your plan', code: 'LIMIT_REACHED' });
        return;
      }
      // Import keeps its historical key-only acknowledgement. POST may only
      // acknowledge a replay if the requested name and JSON were persisted.
      if (!admitted.created && (admitted.project.name !== trimmedName || !isDeepStrictEqual(admitted.project.data, data))) {
        return res.status(409).json({ error: 'clientProjectId already belongs to a different project payload' });
      }
      const { id, name: projectName, createdAt, updatedAt } = admitted.project;
      res.status(admitted.created ? 201 : 200).json({ project: { id, name: projectName, createdAt, updatedAt } });
      return;
    } catch (err) {
      const e = err as { code?: string } | null;
      // unique constraint on (ownerId, name)
      if (e?.code === 'P2002') { res.status(409).json({ error: 'Project name already exists' }); return; }
      console.error('Create project error:', e);
      res.status(500).json({ error: 'Failed to create project' });
      return;
    }
  }

  res.setHeader('Allow', 'GET,POST');
  res.status(405).end();
  return;
}
