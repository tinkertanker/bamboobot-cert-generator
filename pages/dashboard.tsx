import { GetServerSideProps } from 'next';
import Head from 'next/head';
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
  const session = await getServerSession(ctx.req, ctx.res, authOptions as any);
  const userEmail = (session as any)?.user?.email as string | undefined;
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
    <main className="min-h-screen p-8 bg-gray-50">
      <Head>
        <title>Admin Dashboard — Bamboobot</title>
      </Head>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">Signed in as {userEmail}</p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <p className="mt-8 text-sm text-gray-500">Tip: Set ADMIN_EMAILS in env to control access.</p>
      </div>
    </main>
  );
}
