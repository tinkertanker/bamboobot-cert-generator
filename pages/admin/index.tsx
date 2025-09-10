// Admin dashboard main page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

interface AdminDashboardProps {
  stats: {
    totalUsers: number;
    usersByTier: Record<UserTier, number>;
    recentSignups: number;
    totalProjects: number;
    totalPdfsToday: number;
    totalEmailsToday: number;
  };
  recentActivity: Array<{
    id: string;
    userId: string;
    userEmail: string;
    action: string;
    createdAt: string;
  }>;
}

export default function AdminDashboard({ stats, recentActivity }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  
  const tabs = [
    { id: 'overview', label: 'Overview', href: '/admin' },
    { id: 'users', label: 'Users', href: '/admin/users' },
    { id: 'projects', label: 'Projects', href: '/admin/projects' },
    { id: 'usage', label: 'Usage Analytics', href: '/admin/usage' },
    { id: 'system', label: 'System', href: '/admin/system' },
  ];
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
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
      
      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                className={`py-4 px-1 border-b-2 text-sm font-medium transition-colors ${
                  tab.id === activeTab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            description="All registered users"
            color="blue"
          />
          <StatCard
            title="New Users (7 days)"
            value={stats.recentSignups}
            description="Recent signups"
            color="green"
          />
          <StatCard
            title="Total Projects"
            value={stats.totalProjects}
            description="Active projects"
            color="purple"
          />
          <StatCard
            title="PDFs Today"
            value={stats.totalPdfsToday}
            description="Generated today"
            color="yellow"
          />
          <StatCard
            title="Emails Today"
            value={stats.totalEmailsToday}
            description="Sent today"
            color="indigo"
          />
          <StatCard
            title="User Tiers"
            value={`${stats.usersByTier.free} Free / ${stats.usersByTier.plus} Plus`}
            description={`${stats.usersByTier.admin} Admin / ${stats.usersByTier.super_admin} Super`}
            color="pink"
          />
        </div>
        
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentActivity.map((activity) => (
                  <tr key={activity.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {activity.userEmail}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        activity.action === 'pdf_generate' ? 'bg-yellow-100 text-yellow-800' :
                        activity.action === 'email_send' ? 'bg-blue-100 text-blue-800' :
                        activity.action === 'project_create' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {activity.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(activity.createdAt).toLocaleString()}
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

function StatCard({ title, value, description, color }: {
  title: string;
  value: string | number;
  description: string;
  color: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    pink: 'bg-pink-50 text-pink-600',
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className={`inline-flex p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]} mb-4`}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<AdminDashboardProps> = async (context) => {
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
  
  // Fetch stats
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const [
    totalUsers,
    usersByTier,
    recentSignups,
    totalProjects,
    todayUsage,
    recentActivity
  ] = await Promise.all([
    // Total users
    prisma.user.count(),
    
    // Users by tier
    prisma.user.groupBy({
      by: ['tier'],
      _count: true
    }),
    
    // Recent signups
    prisma.user.count({
      where: {
        createdAt: {
          gte: sevenDaysAgo
        }
      }
    }),
    
    // Total projects
    prisma.project.count(),
    
    // Today's usage
    prisma.usageLog.groupBy({
      by: ['action'],
      where: {
        createdAt: {
          gte: startOfToday
        }
      },
      _count: true
    }),
    
    // Recent activity
    prisma.usageLog.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    })
  ]);
  
  // Process tier counts
  const tierCounts: Record<UserTier, number> = {
    free: 0,
    plus: 0,
    admin: 0,
    super_admin: 0
  };
  
  usersByTier.forEach(group => {
    tierCounts[group.tier as UserTier] = group._count;
  });
  
  // Process today's usage
  const pdfCount = todayUsage.find(u => u.action === 'pdf_generate')?._count || 0;
  const emailCount = todayUsage.find(u => u.action === 'email_send')?._count || 0;
  
  return {
    props: {
      stats: {
        totalUsers,
        usersByTier: tierCounts,
        recentSignups,
        totalProjects,
        totalPdfsToday: pdfCount,
        totalEmailsToday: emailCount
      },
      recentActivity: recentActivity.map(activity => ({
        id: activity.id,
        userId: activity.userId,
        userEmail: activity.user.email || 'Unknown',
        action: activity.action,
        createdAt: activity.createdAt.toISOString()
      }))
    }
  };
};