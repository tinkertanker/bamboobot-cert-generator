import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isAuthenticationRequired } from '@/lib/auth/runtime-policy';
import { CLEANUP_KEY_HEADER, secretMatches } from '@/lib/storage/cleanup-handler';

// Scheduled storage cleanup runs from cron with no user session. It may skip
// the session check only when it presents the configured cleanup secret.
const CLEANUP_ENDPOINTS = new Set(['/api/cleanup-r2', '/api/cleanup-s3']);

function isAuthorisedCleanupRequest(req: NextRequest, pathname: string): boolean {
  const secret = process.env.CLEANUP_SECRET_KEY;
  if (!secret || !CLEANUP_ENDPOINTS.has(pathname)) return false;
  return secretMatches(req.headers.get(CLEANUP_KEY_HEADER) ?? undefined, secret);
}

const STATIC_ASSET_PATTERN = /\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|txt|xml|json|map|js|css|woff|woff2|ttf|otf|eot)$/i;
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
    // These routes independently enforce session/PAT authentication even when
    // REQUIRE_AUTH is off. NextAuth JWT middleware cannot authenticate PATs.
    isPathOrDescendant(pathname, '/api/agent') ||
    pathname === '/api/files/download' ||
    isAuthorisedCleanupRequest(req, pathname) ||
    isPathOrDescendant(pathname, '/_next') ||
    (!isPathOrDescendant(pathname, '/api') && STATIC_ASSET_PATTERN.test(pathname))
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // For API routes (non-auth), return 401 if not authenticated
  if (isPathOrDescendant(pathname, '/api')) {
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
  // Next.js build assets are excluded from the matcher (they were always
  // allowed through) so the middleware is not invoked for every chunk request.
  runtime: 'nodejs',
  matcher: ['/((?!_next/static/|_next/image).*)'],
};
