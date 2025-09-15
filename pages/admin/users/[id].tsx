// Admin user details page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import AdminLayout from '@/components/admin/AdminLayout';
import Link from 'next/link';
import { useState } from 'react';

interface UserDetail {
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

interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface UsageLogItem {
  id: string;
  action: string;
  createdAt: string;
  metadata?: unknown;
}

interface PageProps {
  user: UserDetail;
  projects: ProjectSummary[];
  recentActivity: UsageLogItem[];
  isSuperAdmin: boolean;
  currentUserId: string;
}

export default function UserDetailsPage({ user, projects, recentActivity, isSuperAdmin, currentUserId }: PageProps) {
  const [tier, setTier] = useState<UserTier>(user.tier);
  const [saving, setSaving] = useState(false);

  const subNav = (
    <div className="flex items-center gap-2">
      <Link href="/admin/users" className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200">Back to Users</Link>
    </div>
  );

  async function handleTierChange(newTier: UserTier) {
    if (newTier === tier) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users/update-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, tier: newTier })
      });
      if (res.ok) {
        setTier(newTier);
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || 'Failed to update user tier');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to update user tier');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title={`User: ${user.email || user.id}`} subNav={subNav}>
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500 mb-1">Identity</div>
          <div className="text-lg font-semibold text-gray-900">{user.name || 'Unnamed'}</div>
          <div className="text-sm text-gray-600 break-all">{user.email}</div>
          <div className="text-xs text-gray-400 mt-2">ID: {user.id}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500 mb-1">Tier</div>
          {isSuperAdmin && user.id !== currentUserId ? (
            <select
              value={tier}
              onChange={(e) => handleTierChange(e.target.value as UserTier)}
              disabled={saving}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="free">Free</option>
              <option value="plus">Plus</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          ) : (
            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
              tier === 'super_admin' ? 'bg-red-100 text-red-800' :
              tier === 'admin' ? 'bg-purple-100 text-purple-800' :
              tier === 'plus' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {tier.replace('_', ' ')}
            </span>
          )}
          <div className="text-xs text-gray-500 mt-3">
            Created: {new Date(user.createdAt).toLocaleString()}<br/>
            Last active: {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : '—'}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500 mb-1">Usage (today / lifetime)</div>
          <div className="text-sm text-gray-900">PDFs: {user.dailyPdfCount} / {user.lifetimePdfCount}</div>
          <div className="text-sm text-gray-900">Emails: {user.dailyEmailCount} / {user.lifetimeEmailCount}</div>
          <div className="text-sm text-gray-900 mt-2">Projects: {user.projectCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projects */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {projects.map(p => (
                  <tr key={p.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(p.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-sm text-gray-500" colSpan={2}>No projects yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentActivity.map(a => (
                  <tr key={a.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{a.action.replace('_', ' ')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(a.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {recentActivity.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-sm text-gray-500" colSpan={2}>No recent activity.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user?.id) {
    return { redirect: { destination: '/', permanent: false } } as const;
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { tier: true }
  });

  const limits = getTierLimits((currentUser?.tier as UserTier) || 'free');
  if (!limits.canAccessAdmin) {
    return { redirect: { destination: '/', permanent: false } } as const;
  }

  const id = context.params?.id as string;
  if (!id) return { notFound: true } as const;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } }
  });

  if (!user) return { notFound: true } as const;

  const [projects, recentActivity] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: id },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, name: true, createdAt: true, updatedAt: true }
    }),
    prisma.usageLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, action: true, createdAt: true }
    })
  ]);

  return {
    props: {
      user: {
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
        projectCount: user._count.projects,
      },
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        action: a.action,
        createdAt: a.createdAt.toISOString(),
      })),
      isSuperAdmin: currentUser?.tier === 'super_admin',
      currentUserId: session.user.id,
    }
  };
};

