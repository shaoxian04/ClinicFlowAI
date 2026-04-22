# 2026-04-22 — SOAP generate + finalize E2E debug session

Context: walking the full doctor flow end-to-end (login → visit detail →
Generate SOAP → Medications → Preview → Finalize → patient portal) for the
first time. A chain of small bugs surfaced between the three services,
each one hiding the next. Below are the specific failures that tripped us
up and the lessons worth carrying forward.

---

## 1. OpenAI 401 caused by default `openai_api_key="change-me"`

**Symptom:** `/soap/generate` returns 500. Backend logs show
`WebClientResponseException: 401 Unauthorized` from
`/agents/report/generate-sync`. Agent logs show OpenAI returning 401.

**Root cause:** The agent process had been started without `OPENAI_API_KEY`
exported, so `settings.openai_api_key` fell back to the placeholder
`"change-me"`. Every LLM call was 401ing, but `openai_client.py` didn't log
the response body — only the status — so the failure mode looked generic.

**Lesson:** On HTTP ≥ 400 from the upstream LLM, log the response body
**with the model + message count** so the real cause is visible without
reproducing. Silent failures at the LLM boundary are the most expensive
to debug because they masquerade as backend bugs.

**Fix:** `agent/app/llm/openai_client.py` — log `r.text[:2000]` plus
`payload_model`, `tools`, `messages` on `status_code >= 400`.

**Red flag for next time:** agent startup should fail loudly if
`openai_api_key == "change-me"` rather than accepting the placeholder.
Currently not enforced — consider a startup assertion.

---

## 2. pgbouncer (Supabase) rejects prepared statements after the first retry

**Symptom:** Once OpenAI was working, the second `/soap/generate` call for
the same visit returned `DuplicatePreparedStatementError` from asyncpg. First
call succeeded. Bouncing the agent fixed it temporarily, then it broke again.

**Root cause:** Supabase's connection pooler runs in **transaction mode**,
where each transaction may land on a different backend. asyncpg names
prepared statements deterministically per connection; the pooler rebinds
and two different physical backends end up with the same statement name,
which Postgres rejects.

**Fix:** `agent/app/persistence/postgres.py` — `statement_cache_size=0` on
the asyncpg pool. Disables client-side prepared statements entirely.

**Lesson:** Any asyncpg pool pointed at a pgbouncer-transaction-mode
endpoint **must** set `statement_cache_size=0`. Supabase uses this mode
by default on the pooler port (`:6543`). The direct port (`:5432`) doesn't
have this issue but isn't always available.

**Post-mortem reference:** Pair this with the Flyway incompatibility note
in `2026-04-22-backend-boot-and-schema.md` — both are Supabase-pgbouncer
compatibility gotchas that only surface under load.

---

## 3. Stale `agent_turns` history broke OpenAI conversation replay

**Symptom:** OpenAI returns 400 with
`messages with role 'tool' must be a response to a preceeding message with 'tool_calls'`.
Only happened on visits that had failed generation runs earlier.

**Root cause:** `_load_openai_messages()` replayed saved turns as
`[assistant, tool, tool, ...]` but the assistant message had no
`tool_calls` array — it was just the bare content. OpenAI rejects the
payload because `role: "tool"` must be a *response to* a message that
advertised tool calls. Our schema stored `tool_call_name` + `tool_call_args`
on each tool turn but never stitched them back onto the preceding assistant
message.

**Fix:** `agent/app/agents/base.py` — rewrote `_load_openai_messages()` to
group consecutive tool turns under the preceding assistant message and
reconstruct the `tool_calls` array from each tool record's
`tool_call_name`/`tool_call_args`.

**Lesson:** When persisting structured LLM conversations, the serialization
format must round-trip through the provider's API contract, not just your
own. OpenAI tool calls have a two-message shape (assistant + tool) that
are semantically one turn — treat them as one unit on both write and read.

**Verify before trusting history-replay:** Any new provider integration
should have a "replay a saved conversation" test that exercises all
message roles the provider supports.

---

## 4. V7 audit trigger was silently failing

**Symptom:** No symptom at call time — writes to `agent_turns` succeeded.
But `audit_log` never grew. Discovered only when checking audit rows during
this session.

**Root cause:** The trigger function tried to INSERT into `audit_log` with
columns that didn't match the real schema:
- `action = 'AGENT_TURN_WRITE'` — but there's a CHECK constraint on the
  allowed action values; `AGENT_TURN_WRITE` isn't one of them.
- `resource_id = NEW.visit_id` (uuid) — column is `varchar`.
- `correlation_id = gen_random_uuid()` (uuid) — column is `varchar`.
- `details = ...` — column is named `metadata`, not `details`.

The INSERT errored inside the trigger, but the trigger was attached as
`AFTER INSERT` without a guarding `EXCEPTION WHEN ... THEN NULL` block.
Postgres aborted the whole transaction... which *should* have surfaced
as a write failure, except the write was hitting Supabase through a
different path that swallowed the error somewhere.

**Fix:** `V7__agent_turn_audit.sql` now uses `'CREATE'`, casts uuids to
`::varchar`, and writes to `metadata`.

**Lesson:** Database triggers need integration tests, not just schema
reviews. A trigger that never fires (or never successfully inserts) is
indistinguishable from a working one until someone checks the downstream
table. Add `assert count > 0 after op` tests for anything audit-shaped.

**Red flag:** any migration that references a table authored by another
sub-project should be reviewed against that table's live schema, not
against the original PRD/spec. The audit_log schema had drifted.

---

## 5. Stale JWT → silent 403 on every call after a backend restart

**Symptom:** All API calls return 403 after restarting the backend. Login
still worked (issues a fresh token), but the browser was using a token from
before the restart.

**Root cause:** `JwtAuthenticationFilter.java:42` catches the
signature-validation exception **silently** and falls through to anonymous
auth. `.anyRequest().authenticated()` then returns 403, not 401.

**Fix (workaround, not code):** Clearing `localStorage` + re-login flushes
the stale token. No code change in this session.

**Lesson / followup:** Silent token rejection is a debuggability trap.
The filter should either (a) log at INFO when a token is rejected and why,
or (b) return 401 with a clear `WWW-Authenticate` header so the frontend
can trigger a re-auth. 403 for "token expired" is a category error.

**Left as future work** — low priority but worth cleaning up before
production.

---

## 6. Next.js called `/api/post-visit/:id/draft`, backend only has
      `/api/postvisit/:id/generate`

**Symptom:** Clicking "Generate patient preview" showed 404 in the network
tab.

**Root cause:** Naming skew. Frontend uses the hyphenated `/post-visit/`
for the preview (draft) endpoint; backend mounts the controller at
`/postvisit` and only exposes `generate` (the finalize-time call). The
preview draft endpoint was never wired up on the backend.

The frontend already handles this gracefully: on 404 it shows
`Preview unavailable — backend pending` and offers an `Acknowledge anyway`
escape hatch so the doctor can still finalize.

**Lesson:** Graceful 404 handling is good, but the URL-shape skew between
frontend and backend is a regression risk. Add an OpenAPI/type-shared-route
contract between services, or at minimum a smoke test that GETs `/api/*`
routes the frontend references and flags 404s.

---

## 7. UpstreamException surfaced properly — this is the *good* outcome

**Symptom:** Finalize returns HTTP 502 with a clean `WebResult` envelope
instead of a 500 with a stack trace.

**Root cause (feature, not bug):** `/agents/post-visit/summarize` isn't
implemented yet. `AgentServiceClient` catches `WebClientResponseException`,
wraps it as `UpstreamException`, and `GlobalExceptionConfiguration` maps
that to **502 BAD_GATEWAY** with the message
`agent returned HTTP 404`. The frontend shows a human-readable banner.

**Lesson / takeaway:** This is what all unimplemented-upstream paths should
look like. The new exception hierarchy (`BusinessException` →
`ResourceNotFoundException`/`ConflictException`/`UpstreamException`) gave
us three things at once in this session:
1. A clear 502 (not a 500) when an agent endpoint is missing.
2. A structured log line `[UPSTREAM] agent returned HTTP 404 body=...`
   that points directly at the missing route.
3. The transaction that *succeeded* (SOAP finalization writing
   `visit.status=FINALIZED`) wasn't rolled back by the downstream failure,
   because the post-visit summary call happens after the SOAP write commits.

Keep this pattern for every new upstream integration.

---

## 8. Playwright's `.click()` doesn't always reach React's synthetic event
      delegate in this harness

**Symptom:** `page.getByRole('button').click()` executes without error,
but the React `onClick` handler never fires. State doesn't change. No
console error.

**Root cause (suspected):** React 19 attaches event listeners at the root
container rather than bubbling from document. Something in the Playwright
MCP setup (possibly the MCP-injected overlay or the agent's CDP session
ordering) is firing the click event on a different root than React's
listener is attached to. Not reproducible via direct `page.click()` from
a normal Playwright script.

**Workaround used:** Grab the button's `__reactProps$*` key and invoke
`props.onClick(...)` directly with a stub event. Same for `onChange` on
controlled inputs. This bypasses the dispatch entirely and invokes the
React handler directly.

**When to use the workaround:** Only for in-browser E2E debugging via MCP.
**Never** ship this pattern in real Playwright test code — real tests must
exercise the actual event dispatch path because that's what users do. If
real Playwright tests fail the same way, the bug is in React or the app,
not in the test harness.

**Lesson:** When the MCP Playwright harness produces a silent no-op click,
don't keep clicking harder. Switch to direct React-props invocation to
unblock the session, and note the discrepancy as a harness issue — not a
product bug.

---

## Meta-lesson — cascading failures across services

Every bug in this session was on the boundary between two services:
- Backend ↔ Agent (missing route, reactive-security pollution)
- Agent ↔ OpenAI (conversation shape, missing API key)
- Agent ↔ Postgres (pgbouncer vs prepared statements)
- Backend ↔ Postgres (audit trigger schema drift)
- Frontend ↔ Backend (URL skew)

Each was cheap to fix once isolated, but **each one hid the next** because
the error surfaces of upstream failures were too generic to point at the
real cause. The single biggest leverage point from this session was
**adding structured error logging at every service boundary**:
- `[LLM]` on agent LLM calls with status + body on 4xx/5xx
- `[AGENT]` on backend agent calls with status + body on 4xx/5xx
- `[UPSTREAM]` on the global exception handler when wrapping a
  `WebClientResponseException`
- `[BIZ]` on every business exception with its `ResultCode`

Without these, the next debug session will spend an hour chasing a 500
that's actually a 401 two hops away. With them, the cause is in the first
log line of the first failing request.
