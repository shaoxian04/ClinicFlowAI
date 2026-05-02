/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Required for the instrumentation.ts hook (Sentry server-side init).
  experimental: { instrumentationHook: true },
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:8080";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

// Sentry's withSentryConfig wraps next.config and uploads source maps when
// SENTRY_AUTH_TOKEN is set. Without the token it falls back to a passthrough
// (the SDK still captures errors at runtime via the DSN). See SAD §4.2.1.
let exportedConfig = nextConfig;
try {
  const { withSentryConfig } = require("@sentry/nextjs");
  exportedConfig = withSentryConfig(nextConfig, {
    silent: !process.env.CI,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    disableLogger: true,
    hideSourceMaps: true,
  });
} catch {
  // @sentry/nextjs not installed yet — keep base config so build still works.
}

module.exports = exportedConfig;
