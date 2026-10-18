// API endpoint for deleting projects (admin only)
import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { prisma } from '@/lib/server/prisma';
import { logAudit } from '@/lib/server/tiers';
import type { AuthenticatedRequest } from '@/types/api';

const D1_ID_CHUNK = 90;

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
    // D1 has no transactions and allows at most 100 bound values per query.
    // Read the details for the audit log, then delete only those rows, in
    // chunks, so the log never names a project that was not deleted.
    const projectsToDelete: Array<{ id: string; name: string; ownerId: string }> = [];
    let deleted = 0;
    for (let offset = 0; offset < projectIds.length; offset += D1_ID_CHUNK) {
      const chunk = projectIds.slice(offset, offset + D1_ID_CHUNK);
      const found = await prisma.project.findMany({
        where: { id: { in: chunk } },
        select: { id: true, name: true, ownerId: true }
      });
      if (found.length === 0) continue;
      const deleteResult = await prisma.project.deleteMany({
        where: { id: { in: found.map(project => project.id) } }
      });
      projectsToDelete.push(...found);
      deleted += deleteResult.count;
    }
    const result = { deleted, projects: projectsToDelete };
    
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