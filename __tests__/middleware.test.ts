/** @jest-environment node */

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { middleware } from '@/middleware';
import { getInternalRequestKey, INTERNAL_KEY_HEADER } from '@/lib/server/internal-request';

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

function request(pathname: string): NextRequest {
  return new NextRequest(`https://certificates.example${pathname}`);
}

describe('authentication middleware', () => {
  beforeEach(() => {
    process.env.REQUIRE_AUTH = 'true';
    process.env.NEXTAUTH_SECRET = 'test-secret';
    mockedGetToken.mockReset();
  });

  afterEach(() => {
    delete process.env.REQUIRE_AUTH;
    delete process.env.NEXTAUTH_SECRET;
  });

  it('allows the public landing page without reading a token', async () => {
    const response = await middleware(request('/'));

    expect(response.status).toBe(200);
    expect(mockedGetToken).not.toHaveBeenCalled();
  });

  it.each([
    '/api/auth/session',
    '/_next/static/app.js',
    '/logo.png',
    '/pdf-worker.js',
    '/fonts/Rubik-Regular.ttf',
    '/api/files/download?path=session%2Fcertificate.pdf&expires=1&signature=x',
  ])(
    'allows public path %s without reading a token',
    async pathname => {
      const response = await middleware(request(pathname));

      expect(response.status).toBe(200);
      expect(mockedGetToken).not.toHaveBeenCalled();
    },
  );

  it('redirects an unauthenticated page request to the landing page', async () => {
    mockedGetToken.mockResolvedValue(null);

    const response = await middleware(request('/app'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://certificates.example/');
  });

  it.each([
    '/api/projects',
    '/api/files/generated/certificate.pdf',
    '/api/export/report.js',
  ])(
    'rejects unauthenticated API request %s',
    async pathname => {
      mockedGetToken.mockResolvedValue(null);

      const response = await middleware(request(pathname));

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    },
  );

  it('does not treat an API auth lookalike as a public auth endpoint', async () => {
    mockedGetToken.mockResolvedValue(null);

    const response = await middleware(request('/api/authentication'));

    expect(response.status).toBe(401);
  });

  it.each(['/private/certificate.pdf', '/generated/session/certificate.pdf', '/generated.pdf'])(
    'does not exempt unsigned PDF path %s',
    async pathname => {
      mockedGetToken.mockResolvedValue(null);

      const response = await middleware(request(pathname));

      expect(response.status).toBe(307);
    },
  );

  it('treats /api lookalike page paths as pages, not API routes', async () => {
    // Regression: startsWith('/api') used to send /apiary a 401 instead of
    // the page redirect every other gated page receives.
    mockedGetToken.mockResolvedValue(null);

    for (const pathname of ['/apiary', '/api-docs']) {
      const response = await middleware(request(pathname));
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://certificates.example/');
    }

    const apiRoot = await middleware(request('/api'));
    expect(apiRoot.status).toBe(401);
  });

  it('only exempts the exact signed download endpoint, not descendants or lookalikes', async () => {
    mockedGetToken.mockResolvedValue(null);

    for (const pathname of ['/api/files/download/extra', '/api/files/downloadx']) {
      const response = await middleware(request(pathname));
      expect(response.status).toBe(401);
    }
  });

  describe('scheduled storage cleanup', () => {
    function cleanupRequest(pathname: string, key?: string): NextRequest {
      return new NextRequest(`https://certificates.example${pathname}`, {
        method: 'POST',
        headers: key ? { 'x-cleanup-key': key } : {},
      });
    }

    beforeEach(() => {
      process.env.CLEANUP_SECRET_KEY = 'cleanup-secret';
      mockedGetToken.mockResolvedValue(null);
    });

    afterEach(() => {
      delete process.env.CLEANUP_SECRET_KEY;
    });

    it('lets /api/cleanup-r2 through without a session when the cleanup key matches', async () => {
      const response = await middleware(cleanupRequest('/api/cleanup-r2', 'cleanup-secret'));
      expect(response.status).toBe(200);
      expect(mockedGetToken).not.toHaveBeenCalled();
    });

    it('requires a session when the cleanup key is wrong or missing', async () => {
      expect((await middleware(cleanupRequest('/api/cleanup-r2', 'wrong'))).status).toBe(401);
      expect((await middleware(cleanupRequest('/api/cleanup-r2'))).status).toBe(401);
    });

    it('does not let the cleanup key open other API routes', async () => {
      for (const pathname of [
        '/api/storage/list',
        '/api/cleanup-s3',
        '/api/cleanup-r2/extra',
        '/api/cleanup-r2x',
        '/api/internal/email-quota-refund',
      ]) {
        expect((await middleware(cleanupRequest(pathname, 'cleanup-secret'))).status).toBe(401);
      }
    });

    it('requires a session when no cleanup secret is configured', async () => {
      delete process.env.CLEANUP_SECRET_KEY;
      expect((await middleware(cleanupRequest('/api/cleanup-r2', ''))).status).toBe(401);
    });
  });

  describe('internal requests from the email queue', () => {
    function internalRequest(pathname: string, key?: string | null): NextRequest {
      return new NextRequest(`https://internal${pathname}`, {
        method: 'POST',
        headers: key ? { [INTERNAL_KEY_HEADER]: key } : {},
      });
    }

    beforeEach(() => {
      mockedGetToken.mockResolvedValue(null);
    });

    it('lets the quota refund route through with the derived internal key', async () => {
      const response = await middleware(internalRequest('/api/internal/email-quota-refund', getInternalRequestKey()));
      expect(response.status).toBe(200);
      expect(mockedGetToken).not.toHaveBeenCalled();
    });

    it('requires a session without a valid internal key', async () => {
      expect((await middleware(internalRequest('/api/internal/email-quota-refund'))).status).toBe(401);
      expect((await middleware(internalRequest('/api/internal/email-quota-refund', 'wrong'))).status).toBe(401);
      expect((await middleware(internalRequest('/api/internal/email-quota-refund', 'test-secret'))).status).toBe(401);
    });

    it('does not let the internal key open any other route', async () => {
      const key = getInternalRequestKey();
      for (const pathname of ['/api/projects', '/api/internal/other', '/api/internal/email-quota-refund/extra']) {
        expect((await middleware(internalRequest(pathname, key))).status).toBe(401);
      }
    });

    it('rejects the internal route when NEXTAUTH_SECRET is not set', async () => {
      const key = getInternalRequestKey();
      delete process.env.NEXTAUTH_SECRET;
      expect((await middleware(internalRequest('/api/internal/email-quota-refund', key))).status).toBe(401);
    });
  });

  it('gates a /_next lookalike path outside the framework prefix', async () => {
    mockedGetToken.mockResolvedValue(null);

    const response = await middleware(request('/_nextfoo'));

    expect(response.status).toBe(307);
  });

  it('allows an authenticated API request through', async () => {
    mockedGetToken.mockResolvedValue({ sub: 'user-1' });

    const response = await middleware(request('/api/projects'));

    expect(response.status).toBe(200);
  });

  it('allows an authenticated request', async () => {
    mockedGetToken.mockResolvedValue({ sub: 'user-1' });

    const response = await middleware(request('/app'));

    expect(response.status).toBe(200);
  });

  it('allows requests when authentication is explicitly disabled', async () => {
    process.env.REQUIRE_AUTH = 'false';

    const response = await middleware(request('/api/projects'));

    expect(response.status).toBe(200);
    expect(mockedGetToken).not.toHaveBeenCalled();
  });
});
