// Admin system health monitoring page
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import AdminLayout from '@/components/admin/AdminLayout';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface SystemInfo {
  database: {
    size: number;
    tables: {
      name: string;
      count: number;
    }[];
    isHealthy: boolean;
  };
  storage: {
    local: {
      tempImages: number;
      tempImagesCount: number;
      generated: number;
      generatedCount: number;
    };
    r2: {
      enabled: boolean;
      bucket: string | null;
    };
  };
  environment: {
    nodeVersion: string;
    platform: string;
    uptime: number;
    memory: {
      total: number;
      free: number;
      used: number;
      percentage: number;
    };
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
  
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  const getStatusColor = (healthy: boolean) => healthy ? 'text-green-600' : 'text-red-600';
  const getStatusIcon = (healthy: boolean) => healthy ? '✅' : '❌';
  
  return (
    <AdminLayout title="System Health">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Database Health */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Database</h3>
              <span className={getStatusColor(system.database.isHealthy)}>
                {getStatusIcon(system.database.isHealthy)}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Size</span>
                <span className="font-medium">{formatBytes(system.database.size)}</span>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Local Storage</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Temp Images</span>
                    <span>{system.storage.local.tempImagesCount} files ({formatBytes(system.storage.local.tempImages)})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Generated PDFs</span>
                    <span>{system.storage.local.generatedCount} files ({formatBytes(system.storage.local.generated)})</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Cloud Storage (R2/S3)</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Enabled</span>
                    <span className={system.storage.r2.enabled ? 'text-green-600' : 'text-gray-400'}>
                      {system.storage.r2.enabled ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {system.storage.r2.bucket && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Bucket</span>
                      <span>{system.storage.r2.bucket}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Environment */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Environment</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Node Version</span>
                <span>{system.environment.nodeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Platform</span>
                <span>{system.environment.platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Uptime</span>
                <span>{formatUptime(system.environment.uptime)}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Memory Usage</span>
                  <span>{system.environment.memory.percentage.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      system.environment.memory.percentage > 80 ? 'bg-red-500' :
                      system.environment.memory.percentage > 60 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${system.environment.memory.percentage}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-gray-500">
                  <span>Used: {formatBytes(system.environment.memory.used)}</span>
                  <span>Free: {formatBytes(system.environment.memory.free)}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Services */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Services</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Email Providers</h4>
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
                <h4 className="text-sm font-medium text-gray-700 mb-2">Authentication</h4>
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-2xl mb-1 ${system.configuration.requireAuth ? 'text-green-600' : 'text-gray-400'}`}>
                {system.configuration.requireAuth ? '🔒' : '🔓'}
              </div>
              <div className="text-sm text-gray-600">Auth Required</div>
              <div className="text-xs text-gray-500">{system.configuration.requireAuth ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl mb-1 ${system.configuration.projectPersistence ? 'text-green-600' : 'text-gray-400'}`}>
                {system.configuration.projectPersistence ? '💾' : '📝'}
              </div>
              <div className="text-sm text-gray-600">Project Persistence</div>
              <div className="text-xs text-gray-500">{system.configuration.projectPersistence ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl mb-1 ${system.configuration.superAdminConfigured ? 'text-green-600' : 'text-yellow-600'}`}>
                {system.configuration.superAdminConfigured ? '👑' : '⚠️'}
              </div>
              <div className="text-sm text-gray-600">Super Admin</div>
              <div className="text-xs text-gray-500">{system.configuration.superAdminConfigured ? 'Configured' : 'Not set'}</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl mb-1 ${system.configuration.adminDomainConfigured ? 'text-green-600' : 'text-yellow-600'}`}>
                {system.configuration.adminDomainConfigured ? '🏢' : '⚠️'}
              </div>
              <div className="text-sm text-gray-600">Admin Domain</div>
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
  
  // Gather system information
  const dbPath = path.join(process.cwd(), 'database.db');
  let dbSize = 0;
  try {
    const stats = fs.statSync(dbPath);
    dbSize = stats.size;
  } catch {}
  
  // Get table counts
  const [userCount, projectCount, sessionCount, usageLogCount, auditLogCount] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.session.count(),
    prisma.usageLog.count(),
    prisma.auditLog.count()
  ]);
  
  // Check local storage
  const tempImagesDir = path.join(process.cwd(), 'public', 'temp_images');
  const generatedDir = path.join(process.cwd(), 'public', 'generated');
  
  const getDirectorySize = (dir: string) => {
    let size = 0;
    let count = 0;
    try {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            size += stats.size;
            count++;
          }
        } catch {}
      });
    } catch {}
    return { size, count };
  };
  
  const tempImages = getDirectorySize(tempImagesDir);
  const generated = getDirectorySize(generatedDir);
  
  // Memory info
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  const systemInfo: SystemInfo = {
    database: {
      size: dbSize,
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
      local: {
        tempImages: tempImages.size,
        tempImagesCount: tempImages.count,
        generated: generated.size,
        generatedCount: generated.count
      },
      r2: {
        enabled: !!process.env.R2_BUCKET_NAME,
        bucket: process.env.R2_BUCKET_NAME || null
      }
    },
    environment: {
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      uptime: process.uptime(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        percentage: (usedMem / totalMem) * 100
      }
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
      requireAuth: process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true',
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
