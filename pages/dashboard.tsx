import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import prisma from '@/lib/server/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

interface DashboardProps {
  userEmail: string;
  usersCount: number;
  projectsCount: number;
  activeUsers7d: number;
}

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const userEmail = session?.user?.email ?? undefined;
  if (!session || !userEmail) {
    return { redirect: { destination: '/', permanent: false } };
  }
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAdmin = admins.includes(userEmail);
  if (!isAdmin) {
    return { redirect: { destination: '/app', permanent: false } };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [usersCount, projectsCount, activeUsers7d] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.user.count({ where: { lastActiveAt: { gte: sevenDaysAgo } } }),
  ]);

  return {
    props: {
      userEmail,
      usersCount,
      projectsCount,
      activeUsers7d,
    },
  };
};

export default function Dashboard({ userEmail, usersCount, projectsCount, activeUsers7d }: DashboardProps) {
  return (
    <main className="min-h-screen px-4 py-8 sm:p-8 bg-gray-50">
      <Head>
        <title>Admin Dashboard — Bamboobot</title>
      </Head>
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 break-all">Signed in as {userEmail}</p>
          </div>
          <nav aria-label="Dashboard" className="flex flex-wrap gap-2">
            <Link href="/admin" className="px-3 py-1.5 text-sm rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
              Admin area
            </Link>
            <Link href="/app" className="px-3 py-1.5 text-sm rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
              Back to app
            </Link>
          </nav>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-600">Users</p>
            <p className="text-3xl font-semibold">{usersCount}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-600">Projects</p>
            <p className="text-3xl font-semibold">{projectsCount}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-600">Active (7 days)</p>
            <p className="text-3xl font-semibold">{activeUsers7d}</p>
          </div>
        </div>

        <p className="mt-8 text-sm text-gray-500">Tip: set ADMIN_EMAILS in the environment to control who can see this page.</p>
      </div>
    </main>
  );
}
