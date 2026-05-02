# Monitoring Setup — Sentry + Uptime Robot

Implements SAD §4.2.1 (the SaaS-first stack) for the pilot deployment. Both tools are free-tier and observe-only — they never touch application data paths.

## 1. Sentry — error tracking (3 services, 1 free account)

### 1.1. Sign up

1. Create a free account at https://sentry.io/signup/.
2. Create one organisation (e.g. `cliniflow`).
3. Create three projects, one per service:
   - `cliniflow-backend` — platform: **Spring Boot**
   - `cliniflow-agent` — platform: **FastAPI**
   - `cliniflow-frontend` — platform: **Next.js**
4. Copy the DSN from each project (Settings → Projects → `<project>` → Client Keys (DSN)).

### 1.2. Set environment variables

Add the DSNs to `.env` (or your secret store):

```bash
# Backend (Spring Boot)
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<backend-project-id>
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=cliniflow-backend@0.0.1

# Agent (FastAPI) — Pydantic Settings reads these as snake_case
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<agent-project-id>

# Frontend (Next.js) — public DSN is browser-exposed (this is normal & intended)
NEXT_PUBLIC_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<frontend-project-id>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
```

> Note: each service expects its own DSN. If you want them to share one project, set the same DSN for all three (events will be tagged by `release` so you can still filter).

### 1.3. Verify

After deploying with the DSN set:

- **Backend**: throw a deliberate exception from a test endpoint, or hit a route that triggers a 500. Check the Sentry dashboard within ~30 seconds.
- **Agent**: any unhandled exception in a route handler is captured automatically by `sentry-sdk[fastapi]`.
- **Frontend**: trigger a client-side error (e.g. `<button onClick={() => { throw new Error('test') }}>`).

### 1.4. Behaviour when DSN is unset

All three SDKs are **no-ops with zero overhead** when their DSN env var is empty — this is the default in `.env.example`. Tests, CI, and local dev are unaffected.

---

## 2. Uptime Robot — external HTTP probes (~10 minutes)

### 2.1. Sign up

1. Create a free account at https://uptimerobot.com/signUp.
2. Verify your email; the dashboard opens automatically.

### 2.2. Add three monitors

Click "+ New monitor" three times, one per public-facing endpoint. Use these settings for all three:

| Field | Value |
|---|---|
| Monitor Type | `HTTP(s)` |
| Monitoring Interval | `5 minutes` |
| Timeout | `30 seconds` |
| Alert Contacts | your email (default) |

| # | Friendly Name | URL |
|---|---|---|
| 1 | CliniFlow Frontend | `https://<your-domain>/` |
| 2 | CliniFlow Backend Health | `https://<your-domain>/api/actuator/health` (or direct `:8080/actuator/health`) |
| 3 | CliniFlow Agent Health | `https://<your-domain>/agents/health` (or direct `:8000/health`) |

> **Local-only setup**: Uptime Robot probes are external — `localhost` URLs cannot be reached. Either deploy first, or use [ngrok](https://ngrok.com) to expose `:80` for the demo.

### 2.3. Public status page (optional, recommended for the demo)

Settings → Public Status Pages → "+ Add Public Status Page". Toggle all three monitors on, copy the public URL, link it from the project README. Judges click once, see uptime numbers immediately.

---

## 3. Cost & SAD compliance

| Tool | Tier | Limit | SAD §4.2.1 status |
|---|---|---|---|
| Sentry | Free | 5k events/month | ✅ Implemented |
| Uptime Robot | Free | 50 monitors | ✅ Implemented |
| Grafana Cloud (Prometheus + Loki + Tempo) | Free | 10k series, 50GB logs | ⏳ Deferred — see SAD §4.2.1 |

Grafana Cloud is the heaviest of the three to wire in (metrics + logs + traces, plus the four dashboards in §4.2.3). It is intentionally deferred so the pilot can ship with error-tracking and external uptime in place.
