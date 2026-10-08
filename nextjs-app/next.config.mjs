const isDev = process.env.NODE_ENV !== 'production';

// The browser talks to Supabase directly for auth and signed-URL uploads/downloads, so its origin is the only
// third party allowed to receive requests or serve images.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return '';
  }
})();
const supabaseSocket = supabaseOrigin.replace(/^http/, 'ws');

// Content-Security-Policy. 'unsafe-inline' is needed for Next.js's inline bootstrap scripts (no nonce setup)
// and 'unsafe-eval' for heic2any's Emscripten build (HEIC photo conversion), so the value here is in what the
// policy blocks: loading scripts, frames, plugins or forms from any other origin, and sending data anywhere
// except this site and Supabase.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseSocket}`.trim(),
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(!isDev && (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://') ? ['upgrade-insecure-requests'] : []),
].join('; ');

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pino spawns worker threads and sharp is a native module: neither may be bundled into route handlers
    serverComponentsExternalPackages: ['pino', 'sharp'],
  },
  webpack(config) {
    // pdfjs-dist (browser PDF → image conversion) optionally requires the Node 'canvas' package; we never use it.
    config.resolve.alias.canvas = false
    return config
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // API responses carry a parent's data and short-lived signed links: never store them in any cache.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default nextConfig;
