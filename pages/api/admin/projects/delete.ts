// API endpoint for deleting projects (admin only)
import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { prisma } from '@/lib/server/prisma';
import { logAudit } from '@/lib/server/tiers';
import type { AuthenticatedRequest } from '@/types/api';
import { cloudflare, isWorkers } from '@/lib/server/cloudflare';

async function deleteProjectsHandler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  const authenticatedReq = req as AuthenticatedRequest;
  const actor = authenticatedReq.user;
  const { projectIds } = req.body;
  
  if (
    !Array.isArray(projectIds) ||
    projectIds.length === 0 ||
    projectIds.length > 1000 ||
    !projectIds.every((id: unknown) => typeof id === 'string' && id.length > 0)
  ) {
    res.status(400).json({ error: 'Invalid project IDs' });
    return;
  }
  
  try {
    if (isWorkers) {
      const db = cloudflare().env.DB;
      // Native D1 batches roll back together. Never use Prisma's non-atomic
      // transaction shim for a deletion and its audit trail.
      // One JSON binding also keeps 1,000 IDs under D1's 100-parameter limit.
      const ids = JSON.stringify(projectIds);
      const result = await db.batch([
        db.prepare(`INSERT INTO "AuditLog" ("id", "actorId", "action", "targetId", "targetType", "metadata", "createdAt")
          SELECT lower(hex(randomblob(16))), ?, 'project_delete', "id", 'project',
            json_object('projectName', "name", 'ownerId', "ownerId"), ?
          FROM "Project" WHERE "id" IN (SELECT value FROM json_each(?))`)
          .bind(actor.id, new Date().toISOString().replace('Z', '+00:00'), ids),
        db.prepare('DELETE FROM "Project" WHERE "id" IN (SELECT value FROM json_each(?))').bind(ids),
      ]);
      res.status(200).json({ success: true, deleted: result[1].meta.changes });
      return;
    }
    // Delete projects in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get project details for audit log
      const projectsToDelete = await tx.project.findMany({
        where: {
          id: {
            in: projectIds
          }
        },
        select: {
          id: true,
          name: true,
          ownerId: true
        }
      });
      
      // Delete the projects
      const deleteResult = await tx.project.deleteMany({
        where: {
          id: {
            in: projectIds
          }
        }
      });
      
      return { deleted: deleteResult.count, projects: projectsToDelete };
    });
    
    // Log audit for each deleted project
    for (const project of result.projects) {
      await logAudit(
        actor.id,
        'project_delete',
        project.id,
        'project',
        {
          projectName: project.name,
          ownerId: project.ownerId
        }
      );
    }
    
    res.status(200).json({
      success: true,
      deleted: result.deleted
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting projects:', error);
    }
    res.status(500).json({ error: 'Failed to delete projects' });
  }
}

export default withAdminAccess(deleteProjectsHandler);
