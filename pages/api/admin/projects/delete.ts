// API endpoint for deleting projects (admin only)
import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { prisma } from '@/lib/server/prisma';
import { logAudit } from '@/lib/server/tiers';
import type { AuthenticatedRequest } from '@/types/api';

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
  
  if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
    res.status(400).json({ error: 'Invalid project IDs' });
    return;
  }
  
  try {
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
    console.error('Error deleting projects:', error);
    res.status(500).json({ error: 'Failed to delete projects' });
  }
}

export default withAdminAccess(deleteProjectsHandler);