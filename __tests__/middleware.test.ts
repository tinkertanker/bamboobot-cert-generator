/** @jest-environment node */

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { middleware } from '@/middleware';

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

  it.each(['/api/auth/session', '/_next/static/app.js', '/logo.png'])(
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

  it.each(['/api/projects', '/api/files/generated/certificate.pdf'])(
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
