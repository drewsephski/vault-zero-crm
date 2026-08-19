# Setup and local development

Operational detail moved out of the rule docs. `api.md`, `agent.md` and
`environment.md` are what agents read before changing code; this is what a person
reads once.

## First run

```sh
cp .env.example .env        # fill DATABASE_URL, BETTER_AUTH_SECRET; leave ALLOWED_SIGN_IN empty unless this install should be private
docker compose up -d        # Postgres, matching .env.example
bun run db:migrate && bun run db:seed
bun run dev                 # app :3000, api :3001, agent :2000
```

Prisma from the repo root: `db:generate`, `db:migrate`, `db:push`, `db:reset`,
`db:seed`, `db:studio`, `db:deploy`.

## Google Cloud

- **Enable the Gmail API and the Google Calendar API** on the project.
- **Set the consent screen to User type: Internal** if you are on Workspace.
  `gmail.readonly` is a *restricted* scope, so an External app needs OAuth
  verification plus an annual CASA assessment. Going External later means the full
  review — a decision, not a checkbox.

## The agent bridge

```sh
AGENT_URL="http://127.0.0.1:2000"   # 127.0.0.1, not localhost: eve dev is IPv4-only
AGENT_BRIDGE_SECRET="$(openssl rand -base64 32)"
```

| Agent tab error | Cause |
| --- | --- |
| `503` | `AGENT_BRIDGE_SECRET` unset in the app's process |
| `401` | The two processes hold different secrets, **or** `passThroughEnv` in `apps/app/turbo.json` / `apps/agent/turbo.json` is missing the pair (Turbo is strict-env) |
| `502` | Agent not running, or `AGENT_URL` wrong |

`localDev()` accepts any loopback request, so `curl 127.0.0.1` proves nothing about
the bridge — send `-H 'Host: agent.example.com'`. `GET /eve/v1/info` is the whole
inventory, including a `diagnostics` count that finds files eve silently ignored.

## Agent providers

Model-backed sessions use OpenRouter directly through the AI SDK. Search can use
general discovery through AnySearch, current and identity research through Tavily,
and both for deep verification; company-site briefs use Context.dev's structured
extraction:

```sh
OPENROUTER_API_KEY="sk-or-v1-..."
TAVILY_API_KEY="tvly-..."
ANYSEARCH_API_KEY="any-..."
```

Create the keys at [OpenRouter](https://openrouter.ai/keys) and
[Tavily](https://app.tavily.com) or [AnySearch](https://www.anysearch.com/console/api-keys).
The default OpenRouter model is Gemini 2.5
Flash-Lite, currently priced at $0.10 per million input tokens and $0.40 per million
output tokens, so add a small OpenRouter credit balance. Tavily's free plan includes
1,000 search credits per month. Model pricing and provider data policies can change,
so review the OpenRouter provider and privacy settings before sending production CRM
data.

`OPENROUTER_API_KEY` is required for a conversation or research task that invokes the
model. Search keys are optional: without them, the agent uses CRM history and Context.dev
when configured, and explicitly reports that the unavailable search source could not be checked.

## Running the agent

**`bun run dev` is `eve dev --no-ui`** — turbo gives each task a pty, so the
interactive TUI and turbo redraw over each other. `dev:tui` keeps the interactive one,
and only that writes `.eve/logs/` for `eve logs`; under `--no-ui` the turbo pane is
the record.

`hooks/activity.ts` is the replacement narration, **to stderr** (the TUI hides
stdout), printing shape everywhere and argument contents outside production only. It
is **not the audit trail** — `hooks/audit.ts` writes `AgentEvent` regardless.

- A second `bun run dev` fails the whole turbo run.
- An orphaned agent holds the port: `lsof -nP -iTCP:2000 -sTCP:LISTEN`.

### Nothing is researching, and the queue only grows

**`eve dev` never fires schedules on their cron cadence**, and everything visible
still works — the row is written, the sheet says *Queued*, and `dispatch.ts` is never
called. The poke covers this **only when `AGENT_BRIDGE_SECRET` is set**; unset,
`poke()` returns silently and the queue looks exactly like a slow agent.

Tasks the API did not write (`schedule_recheck`) and anything queued while the agent
was down still need a manual run:

```sh
bun run --filter=agent dispatch    # exact production path, both lanes, real credits
```

Its printed `sessionIds` are research rows only, so a run that resolved forty logos
prints an empty list and was not idle. Production uses
`.github/workflows/vault-zero-scheduler.yml` to call the authenticated dispatch
route every five minutes, so the Vercel deployment does not require Vercel Cron.

## `vercel env pull` writes `.env.local`, which wins

`.env.local` is the override the loader reads *last*, and `vercel env pull` writes
**production** credentials there by default. Pull once and every process silently
points at production — not as an error, but as `bun run dev` working perfectly against
the live database. On 2026-08-01 eleven migrations landed on Neon from a laptop.

1. **Pull somewhere inert**: `vercel env pull .env.vercel`.
2. **`packages/db/scripts/require-local-db.ts` guards `db:migrate`, `db:push`,
   `db:reset`, `db:seed`** and takes `ALLOW_REMOTE_DB=1`. `db:deploy` is unguarded on
   purpose. It reads the root files directly rather than `process.env`, because Bun
   auto-loads the working directory's `.env` while Prisma's CLI only sees
   `@crm/env/load`.

If `20260820140000_acquisition_target_engagement_backfill` fails because legacy
targets have unassigned companies (`company.ownerId IS NULL`), fix or exclude those rows
before `prisma migrate resolve`. Do not edit applied migration files. Engagement
ownership is nullable after `20260820160000_acquisition_engagement_owner_nullable`.

## Secrets hygiene

`.gitignore` ignores `.env` and `.env.*` with one negation for `.env.example`, so
`.env.bak` is ignored too. `.env.example` ships no secret — placeholders are empty
strings, asserted by `packages/env/test/root.spec.ts`. **Generate your own secret**;
never reuse one from an example, a tutorial, or another environment.

## Tests

```sh
bun run --filter=api test
bun run --filter=agent test    # integration specs need DATABASE_URL + real Postgres
```
