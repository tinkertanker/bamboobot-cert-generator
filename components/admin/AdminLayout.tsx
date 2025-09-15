import Link from 'next/link';
import { useRouter } from 'next/router';
import { PropsWithChildren, ReactNode } from 'react';
import { signOut } from 'next-auth/react';

type NavItem = { href: string; label: string; match: (path: string) => boolean };

const NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', match: (p) => p === '/admin' },
  { href: '/admin/users', label: 'Users', match: (p) => p.startsWith('/admin/users') },
  { href: '/admin/projects', label: 'Projects', match: (p) => p.startsWith('/admin/projects') },
  { href: '/admin/usage', label: 'Usage', match: (p) => p.startsWith('/admin/usage') },
  { href: '/admin/storage', label: 'Storage', match: (p) => p.startsWith('/admin/storage') },
  { href: '/admin/system', label: 'System', match: (p) => p.startsWith('/admin/system') },
];

export default function AdminLayout({ title, subNav, children }: PropsWithChildren<{ title: string; subNav?: ReactNode }>) {
  const router = useRouter();
  const path = router.pathname;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <Link href="/admin" className="text-xl font-bold text-gray-900">Admin</Link>
              <nav className="hidden md:flex items-center gap-4">
                {NAV.map((item) => {
                  const active = item.match(path);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-2 py-1 border-b-2 text-sm font-medium transition-colors ${
                        active
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">App</Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Sign out
              </button>
            </div>
          </div>
          {/* Second-level bar: title on left, optional sub-nav on right */}
          <div className="flex items-center justify-between py-3 border-t">
            <h1 className="text-base md:text-lg font-semibold text-gray-900">{title}</h1>
            {subNav && (
              <div className="flex items-center gap-2">
                {subNav}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
