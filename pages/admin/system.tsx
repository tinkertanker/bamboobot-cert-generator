// Admin system health monitoring page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { isAuthenticationRequired } from '@/lib/auth/runtime-policy';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import AdminLayout from '@/components/admin/AdminLayout';
import { listObjects } from '@/lib/storage/bucket';

interface SystemInfo {
  database: {
    tables: {
      name: string;
      count: number;
    }[];
    isHealthy: boolean;
  };
  storage: {
    tempImages: number;
    tempImagesCount: number;
    generated: number;
    generatedCount: number;
    emailAttachments: number;
    emailAttachmentsCount: number;
    isHealthy: boolean;
  };
  emailProviders: {
    resend: boolean;
    ses: boolean;
    activeProvider: string;
  };
  authentication: {
    provider: string;
    sessionsActive: number;
    googleOAuthConfigured: boolean;
  };
  configuration: {
    requireAuth: boolean;
    projectPersistence: boolean;
    superAdminConfigured: boolean;
    adminDomainConfigured: boolean;
  };
}

interface SystemPageProps {
  system: SystemInfo;
}

export default function SystemPage({ system }: SystemPageProps) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const getStatusColor = (healthy: boolean) => healthy ? 'text-green-600' : 'text-red-600';
  const getStatusIcon = (healthy: boolean) => healthy ? '✅' : '❌';
  
  return (
    <AdminLayout title="System Health">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Database Health */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Database</h2>
              <span className={getStatusColor(system.database.isHealthy)}>
                <span aria-hidden="true">{getStatusIcon(system.database.isHealthy)}</span>
                <span className="sr-only">{system.database.isHealthy ? 'Healthy' : 'Unhealthy'}</span>
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Engine</span>
                <span className="font-medium">Cloudflare D1</span>
              </div>
              {system.database.tables.map(table => (
                <div key={table.name} className="flex justify-between text-sm">
                  <span className="text-gray-500">{table.name}</span>
                  <span>{table.count} records</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Storage */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">File storage (R2)</h2>
              <span className={getStatusColor(system.storage.isHealthy)}>
                <span aria-hidden="true">{getStatusIcon(system.storage.isHealthy)}</span>
                <span className="sr-only">{system.storage.isHealthy ? 'Healthy' : 'Unreachable'}</span>
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Templates and images</span>
                <span>{system.storage.tempImagesCount} files ({formatBytes(system.storage.tempImages)})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Generated PDFs</span>
                <span>{system.storage.generatedCount} files ({formatBytes(system.storage.generated)})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Queued email attachments</span>
                <span>{system.storage.emailAttachmentsCount} files ({formatBytes(system.storage.emailAttachments)})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Runtime</span>
                <span>Cloudflare Workers</span>
              </div>
            </div>
          </div>
          
          {/* Services */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Services</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Email Providers</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Resend</span>
                    <span className={system.emailProviders.resend ? 'text-green-600' : 'text-gray-400'}>
                      {system.emailProviders.resend ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">AWS SES</span>
                    <span className={system.emailProviders.ses ? 'text-green-600' : 'text-gray-400'}>
                      {system.emailProviders.ses ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Active Provider</span>
                    <span className="font-medium">{system.emailProviders.activeProvider}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Authentication</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Provider</span>
                    <span>{system.authentication.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Active Sessions</span>
                    <span>{system.authentication.sessionsActive}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Google OAuth</span>
                    <span className={system.authentication.googleOAuthConfigured ? 'text-green-600' : 'text-red-600'}>
                      {system.authentication.googleOAuthConfigured ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Configuration Status */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-2xl mb-1 ${system.configuration.requireAuth ? 'text-green-600' : 'text-gray-400'}`} aria-hidden="true">
                {system.configuration.requireAuth ? '🔒' : '🔓'}
              </div>
              <div className="text-sm text-gray-600">Auth required</div>
              <div className="text-xs text-gray-500">{system.configuration.requireAuth ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl mb-1 ${system.configuration.projectPersistence ? 'text-green-600' : 'text-gray-400'}`} aria-hidden="true">
                {system.configuration.projectPersistence ? '💾' : '📝'}
              </div>
              <div className="text-sm text-gray-600">Project persistence</div>
              <div className="text-xs text-gray-500">{system.configuration.projectPersistence ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl mb-1 ${system.configuration.superAdminConfigured ? 'text-green-600' : 'text-yellow-600'}`} aria-hidden="true">
                {system.configuration.superAdminConfigured ? '👑' : '⚠️'}
              </div>
              <div className="text-sm text-gray-600">Super admin</div>
              <div className="text-xs text-gray-500">{system.configuration.superAdminConfigured ? 'Configured' : 'Not set'}</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl mb-1 ${system.configuration.adminDomainConfigured ? 'text-green-600' : 'text-yellow-600'}`} aria-hidden="true">
                {system.configuration.adminDomainConfigured ? '🏢' : '⚠️'}
              </div>
              <div className="text-sm text-gray-600">Admin domain</div>
              <div className="text-xs text-gray-500">{system.configuration.adminDomainConfigured ? 'Configured' : 'Not set'}</div>
            </div>
          </div>
        </div>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<SystemPageProps> = async (context) => {
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
  
  // Get table counts
  const [userCount, projectCount, sessionCount, usageLogCount, auditLogCount] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.session.count(),
    prisma.usageLog.count(),
    prisma.auditLog.count()
  ]);
  
  // Summarise R2 usage by prefix. A listing failure is reported, not fatal.
  const summarise = async (prefix: string) => {
    const objects = await listObjects(prefix);
    return { size: objects.reduce((sum, object) => sum + object.size, 0), count: objects.length };
  };
  let storageHealthy = true;
  const empty = { size: 0, count: 0 };
  const [tempImages, generated, emailAttachments] = await Promise.all([
    summarise('temp_images/'),
    summarise('generated/'),
    summarise('email_queue/')
  ]).catch((err) => {
    console.error('Failed to list R2 objects:', err);
    storageHealthy = false;
    return [empty, empty, empty];
  });
  
  const systemInfo: SystemInfo = {
    database: {
      tables: [
        { name: 'Users', count: userCount },
        { name: 'Projects', count: projectCount },
        { name: 'Sessions', count: sessionCount },
        { name: 'Usage Logs', count: usageLogCount },
        { name: 'Audit Logs', count: auditLogCount }
      ],
      isHealthy: true
    },
    storage: {
      tempImages: tempImages.size,
      tempImagesCount: tempImages.count,
      generated: generated.size,
      generatedCount: generated.count,
      emailAttachments: emailAttachments.size,
      emailAttachmentsCount: emailAttachments.count,
      isHealthy: storageHealthy
    },
    emailProviders: {
      resend: !!process.env.RESEND_API_KEY,
      ses: !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SES_REGION,
      activeProvider: process.env.RESEND_API_KEY ? 'Resend' : 
                      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SES_REGION ? 'AWS SES' : 'None')
    },
    authentication: {
      provider: 'Google OAuth',
      sessionsActive: sessionCount,
      googleOAuthConfigured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
    },
    configuration: {
      requireAuth: isAuthenticationRequired(),
      projectPersistence: process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE === 'true',
      superAdminConfigured: !!(process.env.SUPER_ADMIN_EMAILS || process.env.SUPER_ADMIN_EMAIL),
      adminDomainConfigured: !!(process.env.ADMIN_DOMAINS || process.env.ADMIN_DOMAIN)
    }
  };
  
  return {
    props: {
      system: systemInfo
    }
  };
};
