// Admin user management page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import Link from 'next/link';
import { useState } from 'react';
import { signOut } from 'next-auth/react';

interface UserData {
  id: string;
  email: string;
  name: string | null;
  tier: UserTier;
  createdAt: string;
  lastActiveAt: string | null;
  dailyPdfCount: number;
  dailyEmailCount: number;
  lifetimePdfCount: number;
  lifetimeEmailCount: number;
  projectCount: number;
}

interface UsersPageProps {
  users: UserData[];
  currentUserId: string;
  isSuperAdmin: boolean;
}

export default function UsersPage({ users, currentUserId, isSuperAdmin }: UsersPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<UserTier | 'all'>('all');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  
  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesTier = tierFilter === 'all' || user.tier === tierFilter;
    
    return matchesSearch && matchesTier;
  });
  
  const handleTierChange = async (userId: string, newTier: UserTier) => {
    try {
      const response = await fetch('/api/admin/users/update-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tier: newTier })
      });
      
      if (response.ok) {
        // Refresh page to show updated data
        window.location.reload();
      } else {
        alert('Failed to update user tier');
      }
    } catch (error) {
      console.error('Error updating tier:', error);
      alert('Failed to update user tier');
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">User Management</h1>
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
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Users
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Email or name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filter by Tier
              </label>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as UserTier | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Tiers</option>
                <option value="free">Free</option>
                <option value="plus">Plus</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <div className="text-sm text-gray-600">
                Showing {filteredUsers.length} of {users.length} users
              </div>
            </div>
          </div>
        </div>
        
        {/* Users Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usage Today
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lifetime
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Projects
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={user.id === currentUserId ? 'bg-blue-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.email}
                        </div>
                        {user.name && (
                          <div className="text-sm text-gray-500">
                            {user.name}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isSuperAdmin && user.id !== currentUserId ? (
                        <select
                          value={user.tier}
                          onChange={(e) => handleTierChange(user.id, e.target.value as UserTier)}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
                        >
                          <option value="free">Free</option>
                          <option value="plus">Plus</option>
                          <option value="admin">Admin</option>
                          {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.tier === 'super_admin' ? 'bg-red-100 text-red-800' :
                          user.tier === 'admin' ? 'bg-purple-100 text-purple-800' :
                          user.tier === 'plus' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.tier.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>PDFs: {user.dailyPdfCount}</div>
                      <div>Emails: {user.dailyEmailCount}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>PDFs: {user.lifetimePdfCount}</div>
                      <div>Emails: {user.lifetimeEmailCount}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.projectCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<UsersPageProps> = async (context) => {
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
  
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { tier: true }
  });
  
  const limits = getTierLimits(currentUser?.tier as UserTier || 'free');
  
  if (!limits.canAccessAdmin) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }
  
  const isSuperAdmin = currentUser?.tier === 'super_admin';
  
  // Fetch all users with their stats
  const users = await prisma.user.findMany({
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      _count: {
        select: {
          projects: true
        }
      }
    }
  });
  
  const userData: UserData[] = users.map(user => ({
    id: user.id,
    email: user.email || 'No email',
    name: user.name,
    tier: user.tier as UserTier,
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastActiveAt?.toISOString() || null,
    dailyPdfCount: user.dailyPdfCount,
    dailyEmailCount: user.dailyEmailCount,
    lifetimePdfCount: user.lifetimePdfCount,
    lifetimeEmailCount: user.lifetimeEmailCount,
    projectCount: user._count.projects
  }));
  
  return {
    props: {
      users: userData,
      currentUserId: session.user.id,
      isSuperAdmin
    }
  };
};