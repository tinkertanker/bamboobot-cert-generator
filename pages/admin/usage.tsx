// Admin usage analytics page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import { useRouter } from 'next/router';
import AdminLayout from '@/components/admin/AdminLayout';
import Segmented from '@/components/admin/Segmented';

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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Day keys are UTC (YYYY-MM-DD). Format them by hand in UTC so the label
// neither shifts a day in negative-offset timezones nor differs between the
// server's and the browser's Intl data (which caused hydration mismatches).
function formatDayKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export default function UsagePage({ stats, currentPeriod }: UsagePageProps) {
  const router = useRouter();
  // The period is a query param so getServerSideProps refetches the data; the
  // old local-state toggle only changed the button highlight.
  const setPeriod = (next: 'week' | 'month') => {
    if (next === currentPeriod) return;
    router.push({ pathname: router.pathname, query: { ...router.query, period: next } });
  };
  
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
  const dayCount = Math.max(1, stats.daily.length);
  const avgDaily = {
    pdfs: Math.round(totals.pdfs / dayCount),
    emails: Math.round(totals.emails / dayCount),
    projects: Math.round(totals.projects / dayCount)
  };
  
  const subNav = (
    <Segmented
      ariaLabel="Period"
      items={[
        { label: 'Last 7 days', value: 'week' },
        { label: 'Last 30 days', value: 'month' },
      ]}
      value={currentPeriod}
      onChange={setPeriod}
    />
  );

  return (
    <AdminLayout title="Usage Analytics" subNav={subNav}>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
            <div className="text-sm font-medium text-gray-500">Peak Daily Users</div>
            <div className="text-3xl font-bold text-gray-900">{totals.uniqueUsers}</div>
            <div className="text-xs text-gray-500 mt-1">busiest day this period</div>
          </div>
        </div>
        
        {/* Cost Estimate */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-yellow-900 mb-4">Estimated Monthly Costs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Daily Usage Trend</h2>
            <p className="text-xs text-gray-500 mb-4">
              <span aria-hidden="true">📄</span> PDFs · <span aria-hidden="true">✉️</span> emails · <span aria-hidden="true">📁</span> new projects
            </p>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {[...stats.daily].reverse().map((day) => (
                <div key={day.date} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="text-sm text-gray-600">
                    {formatDayKey(day.date)}
                  </div>
                  <div className="flex space-x-4 text-sm">
                    <span className="text-yellow-700" title="PDFs"><span aria-hidden="true">📄 </span><span className="sr-only">PDFs: </span>{day.pdfs}</span>
                    <span className="text-blue-600" title="Emails"><span aria-hidden="true">✉️ </span><span className="sr-only">Emails: </span>{day.emails}</span>
                    <span className="text-green-700" title="New projects"><span aria-hidden="true">📁 </span><span className="sr-only">New projects: </span>{day.projects}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Top Users */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Users (Lifetime)</h2>
            <div className="space-y-3">
              {stats.topUsers.length === 0 && (
                <p className="text-sm text-gray-500">No users yet.</p>
              )}
              {stats.topUsers.map((user, index) => (
                <div key={user.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-sm font-medium text-gray-900 break-all">
                      {index + 1}. {user.email}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      user.tier === 'super_admin' ? 'bg-red-100 text-red-800' :
                      user.tier === 'admin' ? 'bg-purple-100 text-purple-800' :
                      user.tier === 'plus' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {user.tier.replace(/_/g, ' ')}
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
            <h2 className="text-lg font-semibold text-gray-900">Usage by Tier (Today)</h2>
          </div>
          <div className="relative overflow-x-auto">
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
                        {tier.tier.replace(/_/g, ' ')}
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
    </AdminLayout>
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
  
  const period: 'week' | 'month' = context.query.period === 'month' ? 'month' : 'week';
  const daysToFetch = period === 'week' ? 7 : 30;
  // Work in UTC days (log buckets below use UTC date keys) and include today,
  // so "Last 7 days" is today plus the previous six days.
  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() - (daysToFetch - 1));
  
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
    date.setUTCDate(startDate.getUTCDate() + i);
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
