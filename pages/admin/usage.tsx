// Admin usage analytics page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import Link from 'next/link';
import { useState } from 'react';
import { signOut } from 'next-auth/react';

interface UsageStats {
  daily: {
    date: string;
    pdfs: number;
    emails: number;
    projects: number;
    uniqueUsers: number;
  }[];
  topUsers: {
    id: string;
    email: string;
    tier: UserTier;
    pdfCount: number;
    emailCount: number;
  }[];
  tierBreakdown: {
    tier: UserTier;
    users: number;
    pdfsToday: number;
    emailsToday: number;
  }[];
  costEstimate: {
    emailCost: number;
    storageCost: number;
    totalMonthlyCost: number;
  };
}

interface UsagePageProps {
  stats: UsageStats;
  currentPeriod: 'week' | 'month';
}

export default function UsagePage({ stats, currentPeriod }: UsagePageProps) {
  const [period, setPeriod] = useState<'week' | 'month'>(currentPeriod);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };
  
  // Calculate totals for the period
  const totals = stats.daily.reduce((acc, day) => ({
    pdfs: acc.pdfs + day.pdfs,
    emails: acc.emails + day.emails,
    projects: acc.projects + day.projects,
    uniqueUsers: Math.max(acc.uniqueUsers, day.uniqueUsers)
  }), { pdfs: 0, emails: 0, projects: 0, uniqueUsers: 0 });
  
  // Calculate average daily usage
  const avgDaily = {
    pdfs: Math.round(totals.pdfs / stats.daily.length),
    emails: Math.round(totals.emails / stats.daily.length),
    projects: Math.round(totals.projects / stats.daily.length)
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Usage Analytics</h1>
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
        {/* Period Selector */}
        <div className="mb-6">
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => setPeriod('week')}
              className={`px-4 py-2 text-sm font-medium rounded-l-md ${
                period === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-4 py-2 text-sm font-medium rounded-r-md ${
                period === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border-t border-b border-r`}
            >
              Last 30 Days
            </button>
          </div>
        </div>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Total PDFs</div>
            <div className="text-3xl font-bold text-gray-900">{totals.pdfs}</div>
            <div className="text-xs text-gray-500 mt-1">~{avgDaily.pdfs}/day</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Total Emails</div>
            <div className="text-3xl font-bold text-gray-900">{totals.emails}</div>
            <div className="text-xs text-gray-500 mt-1">~{avgDaily.emails}/day</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">New Projects</div>
            <div className="text-3xl font-bold text-gray-900">{totals.projects}</div>
            <div className="text-xs text-gray-500 mt-1">~{avgDaily.projects}/day</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Active Users</div>
            <div className="text-3xl font-bold text-gray-900">{totals.uniqueUsers}</div>
            <div className="text-xs text-gray-500 mt-1">unique this period</div>
          </div>
        </div>
        
        {/* Cost Estimate */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-yellow-900 mb-4">Estimated Monthly Costs</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-yellow-700">Email Service</div>
              <div className="text-xl font-bold text-yellow-900">{formatCurrency(stats.costEstimate.emailCost)}</div>
            </div>
            <div>
              <div className="text-sm text-yellow-700">Storage (R2/S3)</div>
              <div className="text-xl font-bold text-yellow-900">{formatCurrency(stats.costEstimate.storageCost)}</div>
            </div>
            <div>
              <div className="text-sm text-yellow-700">Total Estimate</div>
              <div className="text-xl font-bold text-yellow-900">{formatCurrency(stats.costEstimate.totalMonthlyCost)}</div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Daily Usage Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Usage Trend</h3>
            <div className="space-y-3">
              {stats.daily.slice(-7).map((day) => (
                <div key={day.date} className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex space-x-4 text-sm">
                    <span className="text-yellow-600">📄 {day.pdfs}</span>
                    <span className="text-blue-600">✉️ {day.emails}</span>
                    <span className="text-green-600">📁 {day.projects}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Top Users */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Users (Lifetime)</h3>
            <div className="space-y-3">
              {stats.topUsers.map((user, index) => (
                <div key={user.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-sm font-medium text-gray-900">
                      {index + 1}. {user.email}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      user.tier === 'super_admin' ? 'bg-red-100 text-red-800' :
                      user.tier === 'admin' ? 'bg-purple-100 text-purple-800' :
                      user.tier === 'plus' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {user.tier.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {user.pdfCount} PDFs, {user.emailCount} emails
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Tier Breakdown */}
        <div className="mt-8 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Usage by Tier (Today)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Users
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    PDFs Today
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Emails Today
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg per User
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.tierBreakdown.map((tier) => (
                  <tr key={tier.tier}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        tier.tier === 'super_admin' ? 'bg-red-100 text-red-800' :
                        tier.tier === 'admin' ? 'bg-purple-100 text-purple-800' :
                        tier.tier === 'plus' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {tier.tier.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tier.users}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tier.pdfsToday}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tier.emailsToday}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tier.users > 0 ? (tier.pdfsToday / tier.users).toFixed(1) : '0'} PDFs
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

export const getServerSideProps: GetServerSideProps<UsagePageProps> = async (context) => {
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
  
  const period = (context.query.period as 'week' | 'month') || 'week';
  const daysToFetch = period === 'week' ? 7 : 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysToFetch);
  startDate.setHours(0, 0, 0, 0);
  
  // Fetch usage data for the period
  const usageLogs = await prisma.usageLog.findMany({
    where: {
      createdAt: {
        gte: startDate
      }
    },
    include: {
      user: {
        select: {
          email: true,
          tier: true
        }
      }
    }
  });
  
  // Group by day
  const dailyStats: { [key: string]: any } = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < daysToFetch; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateKey = date.toISOString().split('T')[0];
    dailyStats[dateKey] = {
      date: dateKey,
      pdfs: 0,
      emails: 0,
      projects: 0,
      users: new Set()
    };
  }
  
  usageLogs.forEach(log => {
    const dateKey = log.createdAt.toISOString().split('T')[0];
    if (dailyStats[dateKey]) {
      if (log.action === 'pdf_generate') dailyStats[dateKey].pdfs++;
      if (log.action === 'email_send') dailyStats[dateKey].emails++;
      if (log.action === 'project_create') dailyStats[dateKey].projects++;
      dailyStats[dateKey].users.add(log.userId);
    }
  });
  
  const daily = Object.values(dailyStats).map((day: any) => ({
    date: day.date,
    pdfs: day.pdfs,
    emails: day.emails,
    projects: day.projects,
    uniqueUsers: day.users.size
  }));
  
  // Get top users
  const topUsers = await prisma.user.findMany({
    orderBy: {
      lifetimePdfCount: 'desc'
    },
    take: 5,
    select: {
      id: true,
      email: true,
      tier: true,
      lifetimePdfCount: true,
      lifetimeEmailCount: true
    }
  });
  
  // Get tier breakdown for today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const tierStats = await prisma.user.groupBy({
    by: ['tier'],
    _count: true,
    _sum: {
      dailyPdfCount: true,
      dailyEmailCount: true
    }
  });
  
  const tierBreakdown = tierStats.map(stat => ({
    tier: stat.tier as UserTier,
    users: stat._count,
    pdfsToday: stat._sum.dailyPdfCount || 0,
    emailsToday: stat._sum.dailyEmailCount || 0
  }));
  
  // Calculate cost estimates (rough estimates)
  const monthlyEmails = daily.reduce((sum, d) => sum + d.emails, 0) * (30 / daysToFetch);
  const emailCost = monthlyEmails * 0.0001; // $0.10 per 1000 emails
  const storageCost = 5; // Flat $5/month for R2/S3
  const totalMonthlyCost = emailCost + storageCost;
  
  return {
    props: {
      stats: {
        daily,
        topUsers: topUsers.map(u => ({
          id: u.id,
          email: u.email || 'Unknown',
          tier: u.tier as UserTier,
          pdfCount: u.lifetimePdfCount,
          emailCount: u.lifetimeEmailCount
        })),
        tierBreakdown,
        costEstimate: {
          emailCost,
          storageCost,
          totalMonthlyCost
        }
      },
      currentPeriod: period
    }
  };
};