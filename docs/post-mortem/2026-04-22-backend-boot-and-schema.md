# Post-Mortem: Backend Boot & Schema Issues — 2026-04-22

Session: Day 3 post-visit portal + frontend polish + E2E testing.

---

## PM-01 — Docker layer cache not invalidated after source file change

**Mistake:** After adding `V4__add_consent_given.sql`, ran `docker compose up --build -d`. Docker cached the `COPY src ./src` layer from a previous build because the timestamp/hash comparison was stale. The new migration file was not included in the deployed JAR.

**Impact:** Backend started but Hibernate validation failed with "missing column consent_given_at" — not from a schema mismatch but from a stale image silently shipping without the new file.

**Solution:** Use `docker compose build --no-cache <service>` when you need to guarantee new source files are picked up. Regular `--build` reuses cached layers. Reserve `--no-cache` for file additions that Docker misses.

---

## PM-02 — `docker compose restart` does not redeploy a rebuilt image

**Mistake:** After `docker compose build --no-cache backend`, ran `docker compose restart backend`. The container restarted but was still running the old image — `restart` stops and starts the existing container, it does not recreate it from the new image.

**Impact:** Backend kept crashing on the stale image, wasting several restart cycles before the root cause was identified.

**Solution:** After rebuilding an image, use `docker compose up -d <service>` (not `restart`) to recreate the container from the new image. `restart` is only for toggling a container that's already on the correct image.

---

## PM-03 — `FlywayAutoConfiguration` excluded silently, `spring.flyway.enabled: true` a no-op

**Mistake:** `application.yml` had `spring.autoconfigure.exclude: FlywayAutoConfiguration` AND `spring.flyway.enabled: true`. The exclude wins — Flyway never ran. The `enabled: true` line was misleading dead config.

**Impact:** V1–V3 migrations were applied at some earlier point manually; subsequent migrations (V4) were never applied. Hibernate validation then blocked startup because the schema was stale relative to JPA entity mappings.

**Solution:** Flyway was removed entirely. Schema is now managed manually via the Supabase SQL editor. `ddl-auto` set to `none` so Hibernate does not validate. See CLAUDE.md "Database setup".

---

## PM-04 — `ddl-auto: validate` blocks startup when schema is manually managed

**Mistake:** Even after removing Flyway, `ddl-auto: validate` was left in `application.yml`. Hibernate validation ran on startup and immediately rejected `UserModel` because `consent_given_at` was not yet in the live Supabase DB.

**Impact:** Backend crash-looped on every restart until `ddl-auto` was switched to `none`.

**Solution:** When there is no automatic migration tool, set `spring.jpa.hibernate.ddl-auto: none`. Never use `validate` unless a migration tool guarantees the schema is always in sync before JPA initialises.

---

## PM-05 — `apiPost` throws `"empty response data"` on void endpoints

**Mistake:** `api.ts::apiPost` has a hard guard: `if (envelope.data == null) throw new Error("empty response data")`. The consent endpoint returns `{"code":0,"data":null}` (a legitimately void response). `apiPost` threw, landing in the catch block and logging a spurious stub warning.

**Impact:** The consent flow still worked (the error was caught and treated as a stub) but produced misleading console output and relied on error-path code for the happy path.

**Solution:** Added `apiPostVoid(path, body?)` to `api.ts` — same logic minus the null guard. Use it for any endpoint that intentionally returns `data: null` on success. `apiPost<T>` is reserved for endpoints that always return a payload.

---

## PM-06 — Component prop names assumed instead of read

**Mistake:** Three components were used with wrong prop names in `doctor/finalized/page.tsx`:
- `<SkeletonGrid rows={3} />` — prop is `count`
- `<EmptyState illustration={…} heading={…} />` — props are `glyph` and `title`
- `<VisitRow status={…} createdAt={…} />` — props are `date`, `visitDone`, `awaitingReview`

**Impact:** Three successive TypeScript build failures inside Docker, each requiring a `docker compose build` cycle (~45s each) to discover the next error.

**Solution:** Before writing JSX for an existing component, read its props type definition first (Grep for `type …Props` or `function ComponentName`). TypeScript will catch mismatches but only at build time inside Docker — not during local editing. Always prefer `Read` before use.

---

## PM-07 — Frontend page called a non-existent backend endpoint

**Mistake:** `doctor/finalized/page.tsx` was written to call `GET /api/doctor/visits?status=FINALIZED`. No such endpoint exists in Spring Boot. The existing doctor dashboard calls `GET /api/visits` and filters client-side.

**Impact:** The Finalized page showed a red `HTTP 500` error banner to the user.

**Solution:** Reuse the existing `/visits` endpoint and filter `soapFinalized === true` in the frontend. Before writing a new API call in a frontend page, check `docs/details/api-surface.md` or grep the controller directory to confirm the route exists.
