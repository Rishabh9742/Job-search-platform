# JobPilot AI

Worldwide job search and **authorized** auto-application agent. Upload a resume once; JobPilot discovers real vacancies from live sources, scores them with an explainable model, generates fact-checked job-specific resumes and cover letters, and submits applications through integrations that genuinely support it. Anything it cannot submit becomes a clear manual-action task with the prepared documents and the official link.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · shadcn-style components · Lucide · PostgreSQL + Prisma · Redis + BullMQ · Anthropic Claude (optional) · pdfkit / docx · Vitest.

---

## Quick start (development)

Prerequisites: Node 22+, Docker.

```bash
npm install
cp .env.example .env
# generate ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste into .env
npm run services:up        # Postgres :5433 + Redis :6380 (docker compose)
npm run db:deploy          # apply migrations (use `npm run db:migrate` when changing the schema)
npm run dev                # web app → http://localhost:3000
npm run worker             # background worker (separate terminal) — REQUIRED for parsing, discovery, applying
```

Then: **Register → Resume Studio (upload + verify) → Settings (categories, countries, filters) → Auto-Apply Agent (rules) → Start Job Search & Auto-Apply.**

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run build && npm start` | Web app (dev / production) |
| `npm run worker` | All BullMQ workers (loads `.env`) |
| `npm test` | 76 automated tests (isolated `jobpilot_test` schema, mocked providers, no real submissions) |
| `npm run typecheck` | TypeScript |
| `npm run e2e` | End-to-end demo against a running app + worker (sandbox submissions only) |

## Configuration (`.env`)

| Variable | Notes |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | Postgres / Redis. Redis runs with AOF so queue state survives restarts. |
| `ENCRYPTION_KEY` | 32-byte base64. Encrypts uploaded resumes, generated documents and employer API keys (AES-256-GCM). |
| `STORAGE_DIR` | Encrypted file storage (outside `public/`; served only through authenticated, ownership-checked routes). For multi-instance deployments mount a shared volume or swap `src/lib/storage.ts` for S3/GCS. |
| `AI_PROVIDER` / `ANTHROPIC_API_KEY` / `AI_MODEL` | `anthropic` (default model `claude-opus-5-5`, structured outputs, server-side refusal fallback) or `none`. Without a key the app runs in **rule-based mode**: heuristic parsing, deterministic matching, and tailoring by reordering verified content. |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Enables Adzuna (free key: developer.adzuna.com). |
| `USAJOBS_API_KEY` / `USAJOBS_USER_AGENT_EMAIL` | Enables USAJOBS (developer.usajobs.gov). |
| `GREENHOUSE_BOARDS`, `LEVER_SITES`, `ASHBY_BOARDS` | Extra public board tokens to crawl (also editable in Settings). |
| `MOCK_MODE` | `true` adds a clearly-labelled `[MOCK]` source; mock jobs are only ever submitted to the sandbox. |
| `SUBMISSION_CONCURRENCY` | Parallel submission workers. |

## Integrations — what is real, and what is not

### Job discovery (all live, normalized into one `Job` model, deduplicated)

| Source | Coverage | Credentials | Status |
|---|---|---|---|
| Greenhouse public boards | Employers on Greenhouse (configured boards), global | none | **Live, tested** |
| Lever public postings | Employers on Lever (configured sites), global | none | **Live, tested** |
| Ashby public job boards | Employers on Ashby (configured orgs), global | none | **Live, tested** |
| Arbeitnow | Europe, mostly Germany (incl. visa-sponsorship listings) | none | **Live, tested** |
| Adzuna | 19 countries incl. IN, US, CA, GB, AU, NZ, SG, DE, FR, NL | app id + key | Adapter implemented + unit-tested against recorded shapes; enable with a key. "Predicted" salaries are discarded. |
| USAJOBS | US federal jobs only | key + email | Adapter implemented + unit-tested; enable with a key. |
| Remotive | Remote roles (24h delayed) | none | Implemented, **disabled by default**: Remotive's terms forbid showing listings behind a sign-up and limit fetches to ~4/day. Enable only for personal use. |

Never invented: missing salary/date/location is shown as "not provided"; ambiguous salary text is kept verbatim; locations come only from source data. Each provider has a minimum fetch interval; 429s become typed rate-limit errors with backoff.

### Application submission — capability registry (also shown in Settings)

| Integration | Form retrieval | Upload | Submit | Confirmation | Verified how |
|---|---|---|---|---|---|
| **Sandbox ATS** (built-in) | ✅ | ✅ | ✅ | ✅ (response + status lookup) | Fully exercised end-to-end. Speaks the Greenhouse application contract; for Greenhouse jobs it serves the job's **real** form. Nothing reaches employers. |
| **Greenhouse Job Board API** | ✅ live | ✅ | ✅ | ✅ (API response) | Form retrieval tested live. Submission implemented to the documented contract (`POST /v1/boards/{token}/jobs/{id}`, multipart, Basic auth) and exercised through the same code path against the sandbox. **Requires the employer's Job Board API key** for that board. |
| **Lever Postings API** | ✅ (with key) | ✅ | ✅ | ✅ (`applicationId`) | Implemented to the documented contract; **not exercised against a live employer** (requires employer-issued key). |
| Browser automation of hosted forms | — | — | — | — | **Not implemented by design.** Greenhouse/Lever/Ashby hosted forms are CAPTCHA-protected; JobPilot does not bypass CAPTCHA/MFA/anti-automation. These become manual tasks. |
| Ashby, Adzuna, Arbeitnow, Remotive, USAJOBS | — | — | — | — | Discovery-only sources (no third-party application API). Manual tasks. |

**Honest limitation:** public job boards do not let third parties submit applications. Live automatic submission to real employers happens only where the user holds an employer-issued API key (e.g. a partner/campus arrangement). In every other case JobPilot prepares the tailored resume, cover letter and form answers and creates a manual-action task with the official URL. Interview/offer updates are recorded by the user; no integration reports them automatically.

### Submission modes
- **SANDBOX (default):** real listings, test submissions to `/api/sandbox/ats`, labelled **TEST** everywhere and excluded from "live" analytics.
- **LIVE:** authorized integrations only; everything else → manual task.

## How the agent behaves

Pipeline (separate BullMQ queues): `resume-parse → job-discovery → matching → job-verification → resume-generation → cover-letter-generation → application-preparation → application-submission → confirmation-verification`, plus `notifications` and a `dead-letter` queue.

- **Eligibility** (hard rules): category/keywords, excluded companies/keywords/industries, countries & remote-region eligibility, work arrangement, employment type, seniority, posting age, salary floor (same currency only), mandatory years of experience, declared work authorization / sponsorship vs. listing policy.
- **Score 0–100** (explainable, factors sum to the score): required skills 35, preferred 10, role relevance 15, experience 15, location 10, projects 5, education/certs 5, freshness 5. Not a prediction of hiring success.
- **Auto-apply only when** eligible, ≥ min score, profile verified, and no blockers (unknown location/date, undeclared authorization, unclear sponsorship…).
- **Truthfulness:** AI output passes a factual-consistency gate — any skill not in the verified profile or any number not in the source is reverted/removed; employers, titles and dates are always copied from the profile. Demographic, legal-declaration, authorization and sponsorship questions are never answered automatically; unconfigured required questions pause the application for the user (answers can be saved to an answer bank).
- **Duplicate prevention:** per-user vacancy key (`sha256(user|employer|title|location)`) with a unique constraint, cross-source duplicate guard, atomic `READY_TO_SUBMIT → SUBMITTING` lock, deterministic per-attempt idempotency keys, and a rule that no attempt is ever re-sent while a prior one may have succeeded — uncertain submissions are verified first (status lookup), and only a definitive "not found" makes them retry-eligible. Interrupted attempts after a crash are marked unconfirmed, never re-sent.
- **Limits:** daily and per-employer limits are enforced under a Postgres advisory lock (no overshoot from concurrent runs) and again at submission time.
- **Control:** Start / Pause (work is delayed, not lost) / Resume / Stop (schedule removed, queued work dropped). User-initiated actions run even when the agent is paused.
- **Recovery:** on worker start, pending applications are re-enqueued idempotently and stuck attempts are reconciled.

## Security
Session cookies (httpOnly, SameSite=Lax, 14-day, hashed in DB) · bcrypt passwords · login throttling · per-user data isolation on every query and file route · AES-256-GCM encryption for files and credentials (secrets never returned to the client or logged) · magic-byte upload validation, 8 MB limit · CSV formula-injection escaping · security headers · full deletion (files + rows) from Settings · audit log of every significant action.

## Tests
`npm test` covers: resume parsing (PDF + DOCX), provider adapters (recorded shapes, mocked fetch, 404/429 handling), deduplication, eligibility rules, scoring, resume factual consistency, React-vs-BA tailoring from one profile, PDF/DOCX generation, form mapping (real Greenhouse question shapes), adapter selection, duplicate submission prevention under concurrency, retry and confirmation verification, crash recovery, daily limits under concurrent matching, user authorization, pause/stop gating, encrypted storage.

## Production deployment
```bash
docker compose --profile app up -d --build    # postgres, redis, web (runs migrations), worker
```
Run at least one `worker` alongside the web app; scale workers horizontally (BullMQ handles distribution). Put the app behind HTTPS (secure cookies are enabled when `NODE_ENV=production`), set `APP_URL` to the public URL (the sandbox adapter and links use it), back up Postgres and the storage volume, and keep Redis persistence (AOF) on. For multiple web instances replace the in-memory login throttle with a Redis-backed one.

## Project structure
```
prisma/schema.prisma            data model (users, profiles, preferences, resumes, versions, sources, jobs, matches,
                                applications, documents, answers, attempts, confirmations, tasks, audit, notifications)
src/lib/jobs/                   provider adapters, normalization, dedupe, registry
src/lib/matching/               eligibility + explainable scoring
src/lib/resume/                 PDF/DOCX text extraction, AI + rule-based parsing
src/lib/documents/              tailoring, cover letters, open answers, consistency gate, PDF/DOCX rendering
src/lib/apply/                  form mapping, submission adapters, capability registry
src/lib/pipeline/               discovery, matching, preparation, submission engine, agent control
src/lib/queue/                  BullMQ queues and enqueue helpers
src/worker/index.ts             worker process
src/app/(app)/                  Dashboard, Find Jobs, Resume Studio, Auto-Apply Agent, Queue, Tracker, Analytics, Settings
src/app/api/                    authenticated route handlers (+ sandbox ATS)
tests/                          Vitest suites
scripts/e2e-demo.ts             end-to-end demonstration
```
