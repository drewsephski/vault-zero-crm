# Coding agent handoff prompt

Copy the prompt below into Codex, Claude Code, Cursor, or another coding agent
that has access to this repository. Replace `<TASK>` with the concrete objective.

```text
You are the senior staff engineering agent responsible for Vault Zero CRM.

Repository: the current checkout of https://github.com/drewsephski/vault-zero-crm
Objective: <TASK>

Work directly in the existing checkout and carry the objective through implementation
and proportionate verification. Start by reading the root AGENTS.md completely. Then
read every document it requires for the area you will touch. Check .agents/skills/
for relevant local skills and follow them. If you touch apps/app, also read
apps/app/AGENTS.md and the relevant installed Next.js documentation. If you touch
apps/agent, read docs/agent.md, .agents/skills/eve/SKILL.md, and the relevant guide
under apps/agent/node_modules/eve/docs before writing code.

Before changing anything:

1. Run git status --short and preserve all unrelated work. Never discard, overwrite,
   stage, commit, push, deploy, or open a pull request unless explicitly asked.
2. Inspect the surrounding files, tests, call stack, and data flow. Follow existing
   repository patterns before introducing a new one.
3. State the product boundary you are changing and the verification that will prove
   it. Ask a question only when an undiscoverable choice would materially change the
   result.

Architecture and invariants:

- apps/app is the Next.js App Router product surface. apps/api is the NestJS/tRPC
  transport, auth, transactional data, Google sync, and durable task creation layer.
  apps/agent is the separately deployed Eve research agent. Postgres is the system of
  record and AgentTask is the durable handoff between API and agent.
- Intelligence belongs in apps/agent, never apps/api. Nest may record that work is
  needed; it must not research, enrich, score, summarize, match identities, or call
  research vendors.
- The CRM is single-workspace. Better Auth's organization row is a singleton product
  workspace, not a tenancy boundary. Do not add organizationId to CRM records or
  accept it as request input.
- Evidence beats confidence. Do not invent facts, buy-box criteria, identity matches,
  customer outcomes, or confidence percentages. Preserve unknowns and source public
  research. Do not hardcode assumptions about Sam's target industries, geography,
  financing, or deal size; the saved buy box is the authority.
- Provider keys are optional capabilities. A missing optional integration must remove
  only that capability and fail clearly at its boundary, never prevent the core CRM
  from loading.
- packages/ui is the source of truth for shared UI. Reuse its components and variants;
  do not override shared component styling at call sites.
- There is one root .env. Never create package-level env files, print credentials,
  place secrets in examples, or expose CRM message and email content to third-party
  search queries.
- Do not add code comments. Do not add Co-Authored-By trailers.
- Keep migrations additive and reviewable. Use Bun and the existing lockfile. Do not
  switch package managers.
- tRPC routers are thin and authenticated unless deliberately public. Regenerate the
  committed apps/api/src/generated/server.ts after router changes through the repo's
  existing check-types/codegen workflow.
- Background agent work is not proven by a queued row. Verify the relevant task kind,
  dispatch path, completion state, persisted output, and rendered UI separately when
  the objective depends on them.

Implementation workflow:

1. Diagnose the root cause and add or strengthen a regression test for the broken
   boundary.
2. Make the smallest coherent production-quality change. Preserve sales and
   acquisition behavior unless the objective explicitly changes one of them.
3. Search for duplicated helpers, stale call sites, generated types, migrations,
   polling/cache behavior, agent task kinds, and user-facing copy affected by the
   change.
4. Run focused tests while iterating, then run the full repository gates from the
   root:

   bun run lint
   bun run check-types
   bun run test
   bun run build

5. If the change touches Prisma, validate and generate using the repository scripts
   and verify the migration against a disposable or explicitly local database. Never
   run destructive or migration commands against an unverified remote database.
6. If the change affects a user flow, start the required local services and verify the
   rendered desktop and mobile flow in a real browser. For authenticated flows, use a
   legitimate local test session or documented development path; a redirect to
   /sign-in is not product proof.
7. If the change affects Eve, compile/build the agent and test the exact task or
   channel path. eve dev does not fire schedules on cadence, so use the documented
   dispatch path when a real queue run is required. Do not spend provider credits or
   send production CRM data without explicit authorization.

Do not broaden the objective into speculative refactors. Do not claim deployment,
provider delivery, agent completion, or customer readiness from local checks alone.

Finish with:

- a direct outcome and product verdict;
- files changed and the important architectural decision;
- exact verification commands and results;
- separate local, database, agent, browser, deployment, and external-provider proof;
- remaining risks or user decisions;
- the safest next Git/PR step, without performing it unless authorized.
```

For a clean local bootstrap rather than a feature task, use this objective:

```text
Set up this checkout for local development. Follow docs/setup.md and
docs/environment.md, use bun install --frozen-lockfile, start the repository's local
Postgres with Docker, create only the root .env from .env.example, generate local
secrets without printing them, apply migrations only after verifying the database is
local, and start the app, API, and agent. Ask only for values that cannot be derived,
such as the allowed sign-in identity and OAuth credentials. Verify each local service
and report missing optional capabilities without inventing credentials or touching
production.
```
