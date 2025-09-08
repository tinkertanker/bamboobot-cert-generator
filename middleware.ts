import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const AUTH_ENABLED = process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true' || process.env.NEXT_PUBLIC_REQUIRE_AUTH === '1';

export async function middleware(req: NextRequest) {
  if (!AUTH_ENABLED) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Always allow auth routes, static assets, and root marketing page
  if (
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/public')
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
  matcher: ['/((?!api/auth|_next|favicon|public).*)'],
};

