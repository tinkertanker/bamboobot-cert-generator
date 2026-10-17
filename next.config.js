const isProduction = process.env.NODE_ENV === 'production';

// Conservative security headers applied to every response. A full script/style
// CSP is intentionally not set: the app relies on Next.js inline bootstrap
// scripts, blob: PDF previews, a public/ web worker, and signed cloud-storage
// URLs whose origins vary by deployment. The directives below are safe for all
// of those and still block clickjacking and <base> tag injection.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Same-origin framing is required for the in-app generated-PDF iframe preview.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'" },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

module.exports = {
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
}
