import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable large file uploads (100MB) for Excel processing
  experimental: {
    // Body size limit for Server Actions
    serverActions: {
      bodySizeLimit: '100mb',
    },
    // Body size limit for proxy/middleware buffering (Next.js 15+)
    // This affects Route Handlers when middleware processes requests
    proxyClientMaxBodySize: '100mb',
  },

  // External packages that should not be bundled (for large file parsing)
  serverExternalPackages: ['exceljs'],

  // SECURITY: HTTP Security Headers (OWASP A05:2021)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Prevent clickjacking attacks
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Control referrer information leakage
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Force HTTPS (2 years, include subdomains, preload-ready)
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Disable unnecessary browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-eval for dev
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
