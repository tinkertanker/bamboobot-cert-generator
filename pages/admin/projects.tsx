// Admin project management page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import AdminLayout from '@/components/admin/AdminLayout';

interface ProjectData {
  id: string;
  name: string;
  ownerEmail: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  dataSize: number; // Size of the JSON data in bytes
  hasImage: boolean;
  rowCount: number;
  columnCount: number;
}

interface ProjectsPageProps {
  projects: ProjectData[];
  totalProjects: number;
  totalSize: number;
  averageSize: number;
  orphanedProjects: number;
}

export default function ProjectsPage({ projects, totalProjects, totalSize, averageSize, orphanedProjects }: ProjectsPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'owner'>('date');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  // IDs awaiting confirmation; kept separate from the checkbox selection so a
  // single-row Delete that gets cancelled doesn't wipe the user's selection.
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const deletingRef = useRef(false);
  deletingRef.current = deleting;
  const router = useRouter();

  useEffect(() => {
    if (!pendingDelete) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deletingRef.current) setPendingDelete(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [pendingDelete]);
  
  const filteredProjects = projects.filter(project => {
    const matchesSearch = searchTerm === '' || 
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.ownerEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });
  
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    switch (sortBy) {
      case 'size':
        return b.dataSize - a.dataSize;
      case 'owner':
        return a.ownerEmail.localeCompare(b.ownerEmail);
      case 'date':
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });
  
  const handleDelete = async (projectIds: string[]) => {
    if (projectIds.length === 0) return;
    setDeleting(true);
    try {
      const response = await fetch('/api/admin/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds })
      });
      
      if (response.ok) {
        setSelectedProjects(prev => {
          const next = new Set(prev);
          projectIds.forEach(id => next.delete(id));
          return next;
        });
        setPendingDelete(null);
        // Re-run getServerSideProps without a full reload so search/sort are kept
        await router.replace(router.asPath, undefined, { scroll: false });
      } else {
        alert('Failed to delete projects');
      }
    } catch (error) {
      console.error('Error deleting projects:', error);
      alert('Failed to delete projects');
    } finally {
      setDeleting(false);
    }
  };

  const allVisibleSelected = sortedProjects.length > 0 && sortedProjects.every(p => selectedProjects.has(p.id));
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const getProjectAge = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return ago(days, 'day');
    if (days < 30) return ago(Math.floor(days / 7), 'week');
    if (days < 365) return ago(Math.floor(days / 30), 'month');
    return ago(Math.floor(days / 365), 'year');
  };
  
  return (
    <AdminLayout title="Project Management">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm font-medium text-gray-500">Total Projects</div>
            <div className="text-2xl font-bold text-gray-900">{totalProjects}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm font-medium text-gray-500">Total Storage</div>
            <div className="text-2xl font-bold text-gray-900">{formatBytes(totalSize)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm font-medium text-gray-500">Average Size</div>
            <div className="text-2xl font-bold text-gray-900">{formatBytes(averageSize)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm font-medium text-gray-500">Orphaned</div>
            <div className={`text-2xl font-bold ${orphanedProjects > 0 ? 'text-red-600' : 'text-gray-900'}`}>{orphanedProjects}</div>
          </div>
        </div>
        
        {/* Filters and Actions */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="admin-project-search" className="block text-sm font-medium text-gray-700 mb-1">
                Search projects
              </label>
              <input
                id="admin-project-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Name or owner email..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="admin-project-sort" className="block text-sm font-medium text-gray-700 mb-1">
                Sort by
              </label>
              <select
                id="admin-project-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'size' | 'owner')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="date">Last Updated</option>
                <option value="size">Size</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {selectedProjects.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(Array.from(selectedProjects))}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Delete selected ({selectedProjects.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProjects(new Set())}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Clear selection
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Projects Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all visible projects"
                      onChange={(e) => {
                        const next = new Set(selectedProjects);
                        sortedProjects.forEach(p => (e.target.checked ? next.add(p.id) : next.delete(p.id)));
                        setSelectedProjects(next);
                      }}
                      checked={allVisibleSelected}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Age
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedProjects.map((project) => (
                  <tr key={project.id} className={selectedProjects.has(project.id) ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${project.name}`}
                        checked={selectedProjects.has(project.id)}
                        onChange={(e) => {
                          const newSelection = new Set(selectedProjects);
                          if (e.target.checked) {
                            newSelection.add(project.id);
                          } else {
                            newSelection.delete(project.id);
                          }
                          setSelectedProjects(newSelection);
                        }}
                      />
                    </td>
                    <td className="px-4 py-4 min-w-[10rem] max-w-xs">
                      <div className="text-sm font-medium text-gray-900 break-words">
                        {project.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {project.id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 min-w-[10rem] max-w-xs break-all">
                      {project.ownerEmail}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{project.rowCount} {project.rowCount === 1 ? 'row' : 'rows'}</div>
                      <div>{project.columnCount} {project.columnCount === 1 ? 'column' : 'columns'}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatBytes(project.dataSize)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500" suppressHydrationWarning>
                      <div>{getProjectAge(project.updatedAt)}</div>
                      <div className="text-xs">Created {getProjectAge(project.createdAt).toLowerCase()}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <button
                        type="button"
                        onClick={() => setPendingDelete([project.id])}
                        className="text-red-600 hover:text-red-700"
                      >
                        Delete<span className="sr-only"> {project.name}</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {sortedProjects.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-sm text-gray-500" colSpan={7}>
                      {projects.length === 0 ? 'No projects yet.' : 'No projects match your search.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Delete Confirmation Modal */}
        {pendingDelete && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !deleting) setPendingDelete(null);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-projects-title"
              aria-describedby="delete-projects-description"
              className="bg-white rounded-lg p-6 max-w-md w-full"
            >
              <h2 id="delete-projects-title" className="text-lg font-semibold mb-4">Confirm delete</h2>
              <p id="delete-projects-description" className="text-gray-600 mb-6">
                Are you sure you want to delete {pendingDelete.length} {pendingDelete.length === 1 ? 'project' : 'projects'}? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  disabled={deleting}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(pendingDelete)}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<ProjectsPageProps> = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  
  // Check if user is admin
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }
  
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { tier: true }
  });
  
  const limits = getTierLimits(user?.tier as UserTier || 'free');
  
  if (!limits.canAccessAdmin) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }
  
  // Fetch all projects with owner info
  const projects = await prisma.project.findMany({
    include: {
      owner: {
        select: {
          email: true
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });
  
  // Calculate stats
  const projectData: ProjectData[] = projects.map(project => {
    const data = project.data as { image?: unknown; tableData?: unknown[]; columns?: unknown[] };
    const dataSize = JSON.stringify(project.data).length;
    
    return {
      id: project.id,
      name: project.name,
      ownerEmail: project.owner.email || 'Unknown',
      ownerId: project.ownerId,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      dataSize,
      hasImage: !!data.image,
      rowCount: data.tableData?.length || 0,
      columnCount: data.columns?.length || 0
    };
  });
  
  const totalSize = projectData.reduce((sum, p) => sum + p.dataSize, 0);
  const averageSize = projectData.length > 0 ? totalSize / projectData.length : 0;
  
  // Find orphaned projects (users that no longer exist)
  const orphanedProjects = 0; // Prisma enforces referential integrity, so this should be 0
  
  return {
    props: {
      projects: projectData,
      totalProjects: projectData.length,
      totalSize,
      averageSize,
      orphanedProjects
    }
  };
};
