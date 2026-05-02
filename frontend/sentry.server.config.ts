import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    release: process.env.SENTRY_RELEASE ?? "cliniflow-frontend@0.1.0",
    tracesSampleRate: 0.0,
    sendDefaultPii: false,
  });
}
