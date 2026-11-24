# OYLA

Learn with AI. Think independently.

OYLA is a responsive learning workspace with a persistent AI Tutor, account settings, and a dashboard of personal learning activity. The interface uses Next.js App Router, TypeScript, Tailwind CSS, Radix/shadcn components, Recharts, and Framer Motion. Supabase supplies Auth, PostgreSQL, and private Storage. DeepSeek supplies streamed tutoring responses.

## Environment

Use Node.js 22 or later, npm, and Supabase CLI 3 for the commands below.

```sh
npm ci
# Only create this file if it does not already exist.
test -e .env.local || (umask 077 && cp .env.example .env.local)
npm run dev
```

| Variable | Source or purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase **Connect** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key from Supabase **Settings → API Keys** |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key from **Settings → API Keys**. Used for trusted chat writes and avatar and research operations. |
| `DEEPSEEK_API_KEY` | Server-only API key from the [DeepSeek platform](https://platform.deepseek.com/api_keys) |
| `DEEPSEEK_MODEL` | Model available to that API key. The template selects `deepseek-flash`. |
| `OYLA_SITE_URL` | Exact origin where OYLA is served, such as `http://localhost:3000`. Use the production HTTPS origin in production. |

Restart the development server after changing configuration. Open [OYLA](http://localhost:3000). The app redirects anonymous users to sign-in, and displays a configuration message when required settings are absent. Keep `.env.local` out of Git and keep the two server-only keys out of any `NEXT_PUBLIC_` variable.

## Supabase setup

### Cloud via SQL Editor

Open the Supabase **SQL Editor** in the OYLA project. Compare the project's reference to the subdomain in `NEXT_PUBLIC_SUPABASE_URL`. Use a separate query tab or clear the editor before each step.

| Order | Script | Successful execution |
| --- | --- | --- |
| 00 | [Preflight](supabase/sql-editor/00_preflight.sql) | Read-only inventory. On a new OYLA installation the named relations and buckets are absent. If any named object already exists, stop and reconcile it first. |
| 01 | [Schema](supabase/sql-editor/01_schema.sql) | Commits the tables, constraints, indexes, and profile triggers. Existing Auth users gain profile/settings rows. Application access is closed at this point. |
| 02 | [Security and services](supabase/sql-editor/02_security.sql) | Commits the grants, RLS policies, private buckets, tutor and dashboard functions, and research export. |
| 03 | [Shared catalog seed](supabase/sql-editor/03_seed_catalog.sql) | Optional. Adds up to three catalog courses without overwriting a match. Safe to repeat. |
| 04 | [Verification](supabase/sql-editor/04_verify.sql) | Read-only. Every check reports `PASS`. |

Scripts 01–03 are transactional. If 01 or 02 reports a collision, that script rolls back. Stop and inspect the conflict. The SQL Editor files mirror the versioned SQL in `supabase/migrations` plus the optional seed. Use one installation path per database. The SQL Editor does not register CLI migration history automatically; avoid subsequently pushing the same migrations on a manually installed project without reconciling the history.

Enable the Email provider and email confirmations in Supabase Auth. Set **Site URL** to `OYLA_SITE_URL` and allowlist the exact `/auth/callback` URL at that origin. Use [the confirmation](supabase/templates/confirmation.html) and [recovery](supabase/templates/recovery.html) templates in the matching email settings to pass token hashes to the server callback. Configure SMTP where needed for delivery and template customization. Test both emails with an isolated account before production use.

### Isolated local verification

With Docker running, use `supabase start` from the project directory. The checked-in configuration uses API port 55421, Postgres port 55422, and a [Mailpit inbox](http://127.0.0.1:55424) for test mail. It applies the migrations to that local stack. Use the local URL and local keys from `supabase status` as process overrides for the command running Next.js. Keep your cloud `.env.local` intact. Use the same OYLA origin as the configured allowlist.

## Database and tutor

- The foundation migration creates profiles and settings on registration, plus shared catalog tables and private per-user learning records. Protected practice solutions and assessment answer keys are in the unexposed `oyla_private` schema.
- The services migration creates private Storage buckets and service-only chat RPCs. A verified user and conversation owner are required to send a message. Database reservations enforce per-user rate limits, deduplicate retries, and track response latency and token usage when reported by DeepSeek.
- The tutor offers Explain, Guide Me, Quiz Me, Check My Work, and Direct Answer. Prompts and provider credentials are server-only. Chats are sent to DeepSeek for generation. Completed replies are saved before the browser receives the completion event.
- Dashboard statistics are per-user. The course and practice cards are labeled samples. Tutor time measures the recorded request-to-completion interval, and charts group by UTC. The experimental Independence Score stays blank.
- Research participation is opt-in. Research exports expose a pseudonymous identifier, interaction date, event type, and learning mode. They omit account identifiers and chat text. Withdrawing consent removes linked research events.
- Full course delivery, practice grading, assessments, study-material uploads, and research administration remain outside the current UI. The tutor shows the latest 30 conversations and up to 100 messages per opened conversation. Model behavior can vary, including in Guide Me. Account deletion covers data held by OYLA and is separate from provider retention and backups.

## Phase 04 Guided Learning

For an existing OYLA project, run only [the Phase 04 migration](supabase/migrations/20261124154622_oyla_guided_learning.sql) in the Supabase SQL Editor. Then run the read-only [Phase 04 verification](supabase/checks/verify_guided_learning.sql) and expect four `PASS` rows. Keep the earlier migrations and data in place. Restart OYLA or reload the tutor after applying the SQL.

Start a fresh **Guide Me** conversation and pick a subject, topic, knowledge level, objective, and English, Russian, or Kazakh for tutor replies. The interface stays in English. Existing conversations still open normally. **Direct Answer** remains a separate mode and keeps incremental provider streaming.

The tutor assesses prior knowledge, asks for an attempt, gives feedback, and asks for a restatement before generating an independent challenge. Four optional hints progress from a question to a partial example on changed inputs. An early exit records an incomplete session. A completed session requires AI review of an independent attempt. Chat turns and the guided stage, timestamps, counters, and summary survive a reload. The timer measures elapsed time including pauses. Questions count learner turns containing a question mark, attempts count distinct submitted problem-solving turns, and hints count distinct requests and successfully delivered hints separately.

Guide Me uses structured model replies and holds provider text server-side until validation. Explicit requests for answers can be declined without a provider call. Output checks block common answer markers and code blocks, but miss some disclosures and can block valid hints. Guide Me still supports an in-flight stop and retry. It sends approved reply text once, so unchecked token deltas never appear in that mode. AI feedback is formative. This phase establishes no objective correctness or academic independence score.

Phase 04 research metrics require the expanded opt-in in Settings. Old consent remains limited to the earlier data until the student explicitly includes guided metrics. `oyla_private.guided_research_export` uses pseudonymous participant and consent-scoped session IDs and excludes chat text, subjects, objectives, and account identifiers. It records stage events, requested hints, attempts, reported model IDs, guard flags, and independent challenge review. A guard flag is a signal, not an independently confirmed leak. Verified correctness remains empty because these open-ended tasks have no objective grader. Withdrawing consent removes linked research rows.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm test` applies the SQL to an isolated in-memory PostgreSQL instance and exercises RLS, trusted writes, retry behavior, and dashboard queries. For end-to-end checks, use two separate browser sessions against the local Supabase stack or an authorized test project. Verify email confirmation and password recovery with captured mail, avatar access, stored messages after refresh, and cross-account denial at both the API and database layers. Real Tutor checks require a valid DeepSeek key and use billable requests.

## Brand

The supplied wordmark is in `public/oyla-logo.png`. The UI uses its dark purple (`#290C67`), primary purple (`#650FBF`), and violet accent (`#8746FA`). The dashboard illustration in `public/learning-hero.png` was generated with ImageGen.
