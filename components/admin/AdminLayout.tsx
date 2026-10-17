import Head from 'next/head';
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

  const navLinks = NAV.map((item) => {
    const active = item.match(path);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`shrink-0 px-2 py-1 border-b-2 text-sm font-medium transition-colors ${
          active
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
        }`}
      >
        {item.label}
      </Link>
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>{`${title} — Bamboobot Admin`}</title>
      </Head>
      {/* Top Bar */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-4">
            <div className="flex items-center gap-6 min-w-0">
              <Link href="/admin" className="text-xl font-bold text-gray-900">Admin</Link>
              <nav aria-label="Admin" className="hidden md:flex items-center gap-4">
                {navLinks}
              </nav>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link href="/app" className="text-sm text-gray-600 hover:text-gray-900">Back to app</Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Sign out
              </button>
            </div>
          </div>
          {/* Narrow screens: the same nav as a horizontally scrollable strip */}
          <nav aria-label="Admin" className="md:hidden -mx-4 px-4 pb-2 flex items-center gap-3 overflow-x-auto">
            {navLinks}
          </nav>
          {/* Second-level bar: title on left, optional sub-nav on right */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-t">
            <h1 className="min-w-0 break-words text-base md:text-lg font-semibold text-gray-900">{title}</h1>
            {subNav && (
              <div className="flex flex-wrap items-center gap-2">
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
