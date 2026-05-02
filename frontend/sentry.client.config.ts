import * as Sentry from "@sentry/nextjs";

// Empty DSN → SDK is a no-op (zero overhead). See SAD §4.2.1.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? "cliniflow-frontend@0.1.0",
    tracesSampleRate: 0.0,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.0,
    sendDefaultPii: false,
  });
}
