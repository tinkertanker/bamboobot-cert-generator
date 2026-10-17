// Admin user management page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits, TIER_LABELS } from '@/types/user';
import type { UserTier } from '@/types/user';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AdminLayout from '@/components/admin/AdminLayout';

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
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const router = useRouter();
  
  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesTier = tierFilter === 'all' || user.tier === tierFilter;
    
    return matchesSearch && matchesTier;
  });
  
  const handleTierChange = async (user: UserData, newTier: UserTier) => {
    if (newTier === user.tier) return;
    if (!window.confirm(`Change ${user.email} from ${TIER_LABELS[user.tier]} to ${TIER_LABELS[newTier]}?`)) return;
    const userId = user.id;
    setUpdatingUserId(userId);
    try {
      let updated = false;
      try {
        const response = await fetch('/api/admin/users/update-tier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, tier: newTier })
        });
        if (response.ok) {
          updated = true;
        } else {
          const body = await response.json().catch(() => ({}));
          alert(body.error || 'Failed to update user tier');
        }
      } catch (error) {
        console.error('Error updating tier:', error);
        alert('Failed to update user tier');
      }
      if (!updated) return;

      try {
        // Re-run getServerSideProps without a full reload so filters are kept
        await router.replace(router.asPath, undefined, { scroll: false });
      } catch (error) {
        console.error('Error refreshing users after tier update:', error);
        alert('Tier updated, but the list could not be refreshed. Reload the page.');
      }
    } finally {
      setUpdatingUserId(null);
    }
  };
  
  return (
    <AdminLayout title="User Management">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="admin-user-search" className="block text-sm font-medium text-gray-700 mb-1">
                Search users
              </label>
              <input
                id="admin-user-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Email or name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="admin-user-tier-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Filter by tier
              </label>
              <select
                id="admin-user-tier-filter"
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
              <div className="text-sm text-gray-600" aria-live="polite">
                Showing {filteredUsers.length} of {users.length} users
              </div>
            </div>
          </div>
        </div>
        
        {/* Users Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <caption className="sr-only">Users</caption>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usage Today
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lifetime
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Projects
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={user.id === currentUserId ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-4 min-w-[12rem] max-w-xs">
                      <div>
                        <div className="text-sm font-medium text-gray-900 break-all">
                          {user.email}
                          {user.id === currentUserId && <span className="ml-1 text-xs font-normal text-blue-700">(you)</span>}
                        </div>
                        {user.name && (
                          <div className="text-sm text-gray-500">
                            {user.name}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {isSuperAdmin && user.id !== currentUserId ? (
                        <select
                          value={user.tier}
                          onChange={(e) => handleTierChange(user, e.target.value as UserTier)}
                          disabled={updatingUserId === user.id}
                          aria-label={`Tier for ${user.email}`}
                          className="text-sm border border-gray-300 rounded px-2 py-1 disabled:opacity-50"
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
                          {TIER_LABELS[user.tier] ?? user.tier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>PDFs: {user.dailyPdfCount}</div>
                      <div>Emails: {user.dailyEmailCount}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>PDFs: {user.lifetimePdfCount}</div>
                      <div>Emails: {user.lifetimeEmailCount}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.projectCount}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500" suppressHydrationWarning>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        View details<span className="sr-only"> for {user.email}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-sm text-gray-500" colSpan={7}>
                      {users.length === 0 ? 'No users yet.' : 'No users match your search or filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
    </AdminLayout>
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
