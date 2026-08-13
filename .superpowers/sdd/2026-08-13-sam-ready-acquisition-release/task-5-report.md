# Task 5 report: Deterministic Eve criteria and atomic dossier writes

## Status

Complete.

## Files

- `apps/agent/agent/lib/acquisition-criteria.ts`
- `apps/agent/agent/tools/write_acquisition_dossier.ts`
- `apps/agent/agent/tools/propose_acquisition_candidates.ts`
- `apps/agent/agent/instructions.md`
- `apps/agent/test/acquisition-dossier.integration.spec.ts`
- `apps/agent/test/agent-tool-contracts.spec.ts`

## RED evidence

### Tool contracts

Command:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/agent-tool-contracts.spec.ts
```

Exit code: `1`.

Observed: `4 pass`, `2 fail`, `10 expect() calls`. Eleven discovery candidates validated under the old maximum of twenty (`Expected: false`, `Received: true`), and a `MATCH` criterion without evidence also validated because the old dossier schema did not consume criteria (`Expected: false`, `Received: true`).

### Atomic dossier behavior

Command:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/acquisition-dossier.integration.spec.ts
```

Exit code: `1`.

Observed: `0 pass`, `5 fail`, `6 expect() calls`. Duplicate, missing, reordered, and invented criterion identities all returned `written: true`. The valid dossier write updated dossier B fields but left `criteria` at dossier A and omitted the criterion-only locations URL from `sourceUrls`.

## GREEN evidence

### Tool contracts

Command:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/agent-tool-contracts.spec.ts
```

Exit code: `0`. Result: `6 pass`, `0 fail`, `14 expect() calls`.

### Atomic dossier behavior

Command:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/acquisition-dossier.integration.spec.ts
```

Exit code: `0`. Result: `5 pass`, `0 fail`, `39 expect() calls`.

The suite verifies dossier A and its research/activity timestamps survive all four identity failures, while valid dossier B persists criteria, findings, unknowns, recommendation, deduplicated finding and criterion sources, activity, `lastActivityAt`, and one shared `researchedAt` value without scheduling a tool-owned recurrence or mutating lifecycle stage.

### Static and build verification

```bash
bun run --filter=agent check-types
bun run --filter=agent lint
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun run --filter=agent build
```

All three exited `0`. TypeScript reported no errors, Biome checked 109 files with no fixes required, and Eve generated the Nitro server output successfully.

## Self-review

- Criterion IDs and results come from `@crm/db/acquisition`.
- `superRefine` requires evidence for `MATCH`, `PARTIAL`, and `CONCERN`; `UNKNOWN` may omit evidence; only `UNKNOWN` may block qualification.
- Identity validation compares the saved expected IDs with received IDs by length and index and reports both lists. Model output is never sorted.
- The dossier tool selects every acquisition profile field consumed by `expectedAcquisitionCriterionIds` and validates before opening the transaction.
- The existing transaction now includes criteria with fit, summary, strengths, concerns, missing information, recommendation, source URLs, activity, company `lastActivityAt`, and the single research timestamp.
- Criterion evidence URLs join the deduplicated finding evidence URL set.
- Candidate discovery is capped at ten while preserving the human review queue and no-auto-create behavior.
- Weekly and 30-day tool scheduling were removed; durable task completion recurrence remains the owner.
- Eve does not write acquisition lifecycle stage.
- No dependencies, code comments, provider assumptions, or fabricated evidence were added.

## Concerns

The first bare build command exited `1` because the isolated worktree has no root `.env` and Eve evaluates the database-backed authored module during build. The build passed when rerun with the task-provided local `DATABASE_URL`; no environment file was created. Optional provider capabilities remained off and did not block the build.
