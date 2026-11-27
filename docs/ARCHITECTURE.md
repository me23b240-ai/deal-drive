# Deal Drive architecture

Sponsorship command center for Saarang 2027 (simulated data) plus a CampusFest historical dataset.

## Layout

- `app/` App Router pages and route handlers. All mutating and reading UI goes through this layer.
- `app/api/*` HTTP API. Every handler validates input with zod, then calls `lib/db/queries` only.
- `components/` shell, coordinator, head, chat, and shadcn `ui/` primitives.
- `lib/db/queries` is the single data-access layer. Pages, APIs, and chatbot tools must not run ad-hoc SQL.
- `lib/domain` status rules, business days, money, channels, initiatives, rules engine, decisions.
- `lib/model` projection, attribution, and gates (pure functions, unit tested).
- `lib/ai` Gemini client, tools, draft guards, rate limit.
- `lib/seed` CampusFest xlsx loader and Saarang simulated seed.
- `scripts/` seed, verify, and chat golden tests (tsx, PowerShell-safe).
- `supabase/migrations/` `001_core.sql`, `002_events_and_facts.sql`, `003_views.sql`. Apply in the Supabase SQL editor.
- `tests/` vitest unit tests.
- `data/private/` gitignored. All Saarang CRM rows are fictional.

## Data flow

1. Demo session is cookies: role `head` | `coordinator`, member id, event id.
2. The server uses `SUPABASE_SERVICE_ROLE_KEY` and enforces scoping in queries. RLS is on with no policies (service role bypass). This is a demo limitation, not production auth.
3. Seeded `is_seed` events (`campusfest-2025`) reject mutations with 403.
4. Mutations call query helpers, then `revalidatePath` so Head and Coordinator see the same numbers.
5. Chatbot tools call the same query layer; write tools insert `pending_actions` and only execute on confirm.

## Time and money

- Timezone: Asia/Kolkata.
- Business days: Mon-Fri minus `holidays`. SQL `business_days_between` matches `lib/domain/bizdays.ts`.
- Money: Indian grouping and compact lakh form from `lib/domain/money.ts`.

## Events

- `saarang-2027` live simulated demo (editable).
- `campusfest-2025-work` working copy (editable).
- `campusfest-2025` original locked seed (chatbot test set).
