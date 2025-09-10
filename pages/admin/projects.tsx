// Admin project management page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import Link from 'next/link';
import { useState } from 'react';
import { signOut } from 'next-auth/react';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
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
  
  const handleDeleteSelected = async () => {
    if (selectedProjects.size === 0) return;
    
    try {
      const response = await fetch('/api/admin/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: Array.from(selectedProjects) })
      });
      
      if (response.ok) {
        window.location.reload();
      } else {
        alert('Failed to delete projects');
      }
    } catch (error) {
      console.error('Error deleting projects:', error);
      alert('Failed to delete projects');
    }
  };
  
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
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Project Management</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/admin"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Back to Dashboard
              </Link>
              <Link
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Back to App
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
            <div className="text-2xl font-bold text-red-600">{orphanedProjects}</div>
          </div>
        </div>
        
        {/* Filters and Actions */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Projects
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Name or owner email..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'size' | 'owner')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="date">Last Updated</option>
                <option value="size">Size</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="flex items-end space-x-2">
              {selectedProjects.size > 0 && (
                <>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Delete Selected ({selectedProjects.size})
                  </button>
                  <button
                    onClick={() => setSelectedProjects(new Set())}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Clear Selection
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Projects Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProjects(new Set(sortedProjects.map(p => p.id)));
                        } else {
                          setSelectedProjects(new Set());
                        }
                      }}
                      checked={selectedProjects.size === sortedProjects.length && sortedProjects.length > 0}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Age
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedProjects.map((project) => (
                  <tr key={project.id} className={selectedProjects.has(project.id) ? 'bg-blue-50' : ''}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {project.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {project.id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {project.ownerEmail}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{project.rowCount} rows</div>
                      <div>{project.columnCount} columns</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatBytes(project.dataSize)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{getProjectAge(project.updatedAt)}</div>
                      <div className="text-xs">Created {getProjectAge(project.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => {
                          setSelectedProjects(new Set([project.id]));
                          setShowDeleteConfirm(true);
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete {selectedProjects.size} project(s)? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleDeleteSelected();
                    setShowDeleteConfirm(false);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
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
    const data = project.data as any;
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