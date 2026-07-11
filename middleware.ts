import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isAuthenticationRequired } from '@/lib/auth/runtime-policy';

const STATIC_ASSET_PATTERN = /\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|txt|xml|json|map)$/i;
// Existing email links rely on this anonymous path. Keep the exception narrow;
// private/signed certificate delivery will replace it in the storage hardening.
const LEGACY_PUBLIC_GENERATED_PDF_PATTERN = /^\/generated\/.+\.pdf$/i;

function isPathOrDescendant(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export async function middleware(req: NextRequest) {
  if (!isAuthenticationRequired()) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Authentication endpoints, framework internals, and public static assets
  // must remain reachable before a session exists. API paths are never treated
  // as static assets merely because their final segment has a file extension.
  if (
    pathname === '/' ||
    isPathOrDescendant(pathname, '/api/auth') ||
    isPathOrDescendant(pathname, '/_next') ||
    LEGACY_PUBLIC_GENERATED_PDF_PATTERN.test(pathname) ||
    (!isPathOrDescendant(pathname, '/api') && STATIC_ASSET_PATTERN.test(pathname))
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // For API routes (non-auth), return 401 if not authenticated
  if (pathname.startsWith('/api')) {
    if (!token) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    return NextResponse.next();
  }

  // For app pages: redirect unauthenticated users to marketing page
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // If authenticated on marketing page, send to /app (handled client-side too)
  return NextResponse.next();
}

export const config = {
  // Node.js middleware can read server-only environment variables at runtime.
  // Matching every path ensures API paths ending in a file extension are gated.
  runtime: 'nodejs',
  matcher: ['/:path*'],
};
