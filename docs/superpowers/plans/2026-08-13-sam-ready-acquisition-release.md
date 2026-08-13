# Sam-ready Acquisition Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an authenticated acquisition workflow in which only legitimate targets appear, every fit assessment is deterministic and evidence-backed, failed refreshes preserve the last valid dossier, and the production result is verified on Vercel.

**Architecture:** Put acquisition identities, lifecycle sets, criterion IDs, and task kinds in one shared `@crm/db/acquisition` module. Enforce target and active-task identity in Postgres, keep orchestration in NestJS, keep evaluation in Eve, and return the dossier plus an independently persisted research state to the Next.js UI.

**Tech Stack:** Bun 1.3.12, TypeScript 5.9, Prisma 7/Postgres, NestJS 11 with nestjs-trpc 2.13, Eve 0.29.4, Next.js 16.3/React 19, TanStack Query, nuqs 2.8, shared shadcn UI, Vercel.

## Global Constraints

- Read `docs/api.md`, `docs/agent.md`, `docs/design.md`, `docs/setup.md`, and `CONTRIBUTING.md` before execution.
- Read `apps/agent/node_modules/eve/docs/README.md` and `apps/agent/node_modules/eve/docs/tools/overview.mdx` before editing Eve code.
- Use Bun only. Do not switch package managers or add dependencies.
- Never add code comments.
- Intelligence stays in `apps/agent`; NestJS validates inputs, persists state, and queues `AgentTask` rows.
- Shared UI components come from `packages/ui`; do not override component styling at call sites.
- Do not add `useEffect`; derive UI state from query data, URL state, and event handlers.
- Preserve `/companies`, `/deals`, `Company`, and `Deal` compatibility identifiers.
- Do not redesign `DealStage` or add `AcquisitionOpportunity` in this release.
- Missing optional providers remove capability and never destroy the current dossier.
- All local database tests, migrations, and dev processes use `postgresql://postgres:postgres@127.0.0.1:5432/crm` explicitly with the Docker Postgres service; never let a root production `.env` choose the local test database.
- A company may exist without a target; every target view and metric requires an `AcquisitionTarget` row.
- `researchedAt` changes only in the transaction that commits a complete valid dossier.
- No coauthor trailers in commits.

---

### Task 1: Shared acquisition domain and database invariants

**Files:**
- Create: `packages/db/src/acquisition.ts`
- Create: `packages/db/test/acquisition.spec.ts`
- Create: `packages/db/prisma/migrations/20260813210000_sam_ready_acquisition_release/migration.sql`
- Modify: `packages/db/package.json`
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Produces: `ACQUISITION_CRITERION_IDS`, `ACQUISITION_CRITERION_RESULTS`, `ACQUISITION_TASK_KINDS`, `ACQUISITION_TASK_INTERVAL_MS`, `ACTIVE_ACQUISITION_STAGES`, `AcquisitionCriterionAssessment`, `AcquisitionCriterionId`, `AcquisitionTargetView`, `expectedAcquisitionCriterionIds(profile)`, `hasAcquisitionFocus(profile)`, and `targetStages(view)` from `@crm/db/acquisition`.
- Produces: `AcquisitionTarget.criteria: Json` and `AgentTask.lastError: String?`.
- Produces: the Postgres invariant that only one unfinished task exists for a `(kind, contactId, companyId)` subject.

- [ ] **Step 1: Write failing shared-domain tests**

Create `packages/db/test/acquisition.spec.ts` with focused tests for every configured buy-box field and lifecycle view:

```ts
import { describe, expect, it } from "bun:test";
import { AcquisitionStage } from "@crm/db/enums";
import {
	expectedAcquisitionCriterionIds,
	hasAcquisitionFocus,
	targetStages,
} from "../src/acquisition";

const profile = {
	preferredIndustries: ["HVAC"],
	geographies: ["Illinois"],
	excludedCategories: ["New construction"],
	revenueMin: 1,
	revenueMax: null,
	ebitdaMin: 1,
	ebitdaMax: null,
	purchasePriceMin: 1,
	purchasePriceMax: null,
	ownerInvolvement: "TRANSITIONAL",
	recurringRevenuePreference: "PREFERRED",
	customerConcentrationMax: 20,
	assetPreference: "ASSET_LIGHT",
	financingAssumptions: "SBA with a seller note",
};

describe("acquisition domain", () => {
	it("derives criterion identity in canonical order", () => {
		expect(expectedAcquisitionCriterionIds(profile)).toEqual([
			"industry",
			"geography",
			"excluded-categories",
			"revenue",
			"ebitda",
			"purchase-price",
			"owner-involvement",
			"recurring-revenue",
			"customer-concentration",
			"asset-profile",
			"financing",
		]);
	});

	it("requires an industry or geography for acquisition research", () => {
		expect(hasAcquisitionFocus({ preferredIndustries: [], geographies: [] })).toBe(false);
		expect(hasAcquisitionFocus({ preferredIndustries: ["HVAC"], geographies: [] })).toBe(true);
	});

	it("defines active and historical lifecycle scopes once", () => {
		expect(targetStages("active")).not.toContain(AcquisitionStage.REJECTED);
		expect(targetStages("active")).not.toContain(AcquisitionStage.ACQUIRED);
		expect(targetStages("rejected")).toEqual([AcquisitionStage.REJECTED]);
		expect(targetStages("acquired")).toEqual([AcquisitionStage.ACQUIRED]);
		expect(targetStages("history")).toBeNull();
	});
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test packages/db/test/acquisition.spec.ts`

Expected: FAIL because `packages/db/src/acquisition.ts` does not exist.

- [ ] **Step 3: Implement the shared acquisition module**

Create the constants and pure functions in `packages/db/src/acquisition.ts`. Keep the profile input structural so API and agent callers can pass Prisma projections without conversion:

```ts
import { AcquisitionStage } from "./generated/prisma/enums";

export const ACQUISITION_CRITERION_IDS = [
	"industry",
	"geography",
	"excluded-categories",
	"revenue",
	"ebitda",
	"purchase-price",
	"owner-involvement",
	"recurring-revenue",
	"customer-concentration",
	"asset-profile",
	"financing",
] as const;

export const ACQUISITION_CRITERION_RESULTS = [
	"MATCH",
	"PARTIAL",
	"CONCERN",
	"UNKNOWN",
] as const;

export const ACQUISITION_TASK_KINDS = [
	"acquisition-discovery",
	"acquisition-refresh",
] as const;

export const ACQUISITION_TASK_INTERVAL_MS = {
	"acquisition-discovery": 7 * 24 * 60 * 60 * 1000,
	"acquisition-refresh": 30 * 24 * 60 * 60 * 1000,
} as const;

export const ACTIVE_ACQUISITION_STAGES = [
	AcquisitionStage.DISCOVERED,
	AcquisitionStage.RESEARCHING,
	AcquisitionStage.QUALIFIED,
	AcquisitionStage.WATCHLIST,
	AcquisitionStage.CONTACTED,
	AcquisitionStage.INTERESTED,
	AcquisitionStage.OPPORTUNITY,
	AcquisitionStage.DILIGENCE,
] as const;

export type AcquisitionCriterionId =
	(typeof ACQUISITION_CRITERION_IDS)[number];
export type AcquisitionCriterionResult =
	(typeof ACQUISITION_CRITERION_RESULTS)[number];
export type AcquisitionTargetView =
	| "active"
	| "rejected"
	| "acquired"
	| "history";

export type AcquisitionCriterionAssessment = {
	id: AcquisitionCriterionId;
	result: AcquisitionCriterionResult;
	explanation: string;
	blocksQualification: boolean;
	evidence: { label: string; url: string }[];
};

type AcquisitionFocus = {
	preferredIndustries: readonly string[];
	geographies: readonly string[];
};

type AcquisitionCriteriaProfile = AcquisitionFocus & {
	excludedCategories: readonly string[];
	revenueMin: unknown | null;
	revenueMax: unknown | null;
	ebitdaMin: unknown | null;
	ebitdaMax: unknown | null;
	purchasePriceMin: unknown | null;
	purchasePriceMax: unknown | null;
	ownerInvolvement: unknown | null;
	recurringRevenuePreference: unknown | null;
	customerConcentrationMax: number | null;
	assetPreference: unknown | null;
	financingAssumptions: string | null;
};

export function hasAcquisitionFocus(profile: AcquisitionFocus): boolean {
	return profile.preferredIndustries.length > 0 || profile.geographies.length > 0;
}

export function expectedAcquisitionCriterionIds(
	profile: AcquisitionCriteriaProfile,
): AcquisitionCriterionId[] {
	return ACQUISITION_CRITERION_IDS.filter((id) => {
		if (id === "industry") return profile.preferredIndustries.length > 0;
		if (id === "geography") return profile.geographies.length > 0;
		if (id === "excluded-categories") return profile.excludedCategories.length > 0;
		if (id === "revenue") return profile.revenueMin !== null || profile.revenueMax !== null;
		if (id === "ebitda") return profile.ebitdaMin !== null || profile.ebitdaMax !== null;
		if (id === "purchase-price") return profile.purchasePriceMin !== null || profile.purchasePriceMax !== null;
		if (id === "owner-involvement") return profile.ownerInvolvement !== null;
		if (id === "recurring-revenue") return profile.recurringRevenuePreference !== null;
		if (id === "customer-concentration") return profile.customerConcentrationMax !== null;
		if (id === "asset-profile") return profile.assetPreference !== null;
		return Boolean(profile.financingAssumptions?.trim());
	});
}

export function targetStages(
	view: AcquisitionTargetView,
): readonly AcquisitionStage[] | null {
	if (view === "active") return ACTIVE_ACQUISITION_STAGES;
	if (view === "rejected") return [AcquisitionStage.REJECTED];
	if (view === "acquired") return [AcquisitionStage.ACQUIRED];
	return null;
}
```

Add `./acquisition` to `packages/db/package.json` exports.

- [ ] **Step 4: Add the schema and migration invariants**

Add `criteria Json @default("[]")` to `AcquisitionTarget` and `lastError String?` to `AgentTask`. Write a migration that:

1. Adds both columns without invalidating existing rows.
2. Finishes duplicate active tasks deterministically, retaining the highest-priority oldest-due row.
3. Creates an expression-based partial unique index over task kind and nullable subjects where `finishedAt IS NULL`.

Use SQL equivalent to:

```sql
ALTER TABLE "acquisitionTarget" ADD COLUMN "criteria" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "agentTask" ADD COLUMN "lastError" TEXT;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "kind", COALESCE("contactId", ''), COALESCE("companyId", '')
    ORDER BY "priority" DESC, "dueAt" ASC, "createdAt" ASC
  ) AS position
  FROM "agentTask"
  WHERE "finishedAt" IS NULL
)
UPDATE "agentTask"
SET "finishedAt" = CURRENT_TIMESTAMP,
    "outcome" = 'Superseded while enforcing active-task uniqueness'
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX "agentTask_active_subject_kind_key"
ON "agentTask" ("kind", COALESCE("contactId", ''), COALESCE("companyId", ''))
WHERE "finishedAt" IS NULL;
```

- [ ] **Step 5: Apply locally, generate Prisma, and verify GREEN**

Run:

```bash
docker compose up -d postgres
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun --cwd packages/db x prisma migrate deploy
bun run db:generate
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test packages/db/test/acquisition.spec.ts
bun run --filter=@crm/db check-types
```

Expected: migration applies, Prisma generates, focused tests pass, and the DB package type-checks.

- [ ] **Step 6: Commit the shared invariant layer**

```bash
git add packages/db/src/acquisition.ts packages/db/src/generated packages/db/test/acquisition.spec.ts packages/db/package.json packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260813210000_sam_ready_acquisition_release/migration.sql
git commit -m "feat(db): enforce acquisition target invariants"
```

---

### Task 2: Durable task state and concurrent queue idempotency

**Files:**
- Create: `packages/db/test/agent-tasks.spec.ts`
- Modify: `packages/db/src/agent-tasks.ts`
- Modify: `apps/agent/agent/lib/tasks.ts`
- Modify: `apps/agent/test/tasks.integration.spec.ts`
- Modify: `apps/api/src/agent/agent-trigger.service.ts`
- Modify: `apps/api/test/agent-trigger.spec.ts`

**Interfaces:**
- Consumes: `AgentTask.lastError` and the active-task partial unique index from Task 1.
- Produces: `agentTaskState(task, now): { status: "idle" | "queued" | "running" | "retrying" | "failed"; error: string | null }` and `RETRYING_OUTCOME_PREFIX` from `@crm/db/agent-tasks`.
- Produces: `AgentTriggerService` enqueue methods returning `{ taskId: string; created: boolean }` instead of unverifiable `void`.
- Produces: successful acquisition task completion atomically finishing the current row and creating its next scheduled recurrence.

- [ ] **Step 1: Write failing pure state-mapping tests**

Cover all persisted mappings without time or lease heuristics:

```ts
const now = new Date("2026-08-13T18:00:00.000Z");
expect(agentTaskState(null, now)).toEqual({ status: "idle", error: null });
expect(agentTaskState({ dueAt: now, startedAt: null, finishedAt: null, outcome: null, lastError: null }, now))
	.toEqual({ status: "queued", error: null });
expect(agentTaskState({ dueAt: new Date("2026-09-12T18:00:00.000Z"), startedAt: null, finishedAt: null, outcome: null, lastError: null }, now))
	.toEqual({ status: "idle", error: null });
expect(agentTaskState({ dueAt: now, startedAt: now, finishedAt: null, outcome: null, lastError: null }, now))
	.toEqual({ status: "running", error: null });
expect(agentTaskState({ dueAt: now, startedAt: now, finishedAt: null, outcome: "retrying: provider timeout", lastError: "provider timeout" }, now))
	.toEqual({ status: "retrying", error: "provider timeout" });
expect(agentTaskState({ dueAt: now, startedAt: now, finishedAt: now, outcome: "provider timeout", lastError: "provider timeout" }, now))
	.toEqual({ status: "failed", error: "provider timeout" });
```

- [ ] **Step 2: Run the pure test and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test packages/db/test/agent-tasks.spec.ts`

Expected: FAIL because the state mapper is absent.

- [ ] **Step 3: Implement the persisted state mapper**

Implement the mapping as a pure function:

```ts
export const RETRYING_OUTCOME_PREFIX = "retrying:";

type AgentTaskStateInput = {
	dueAt: Date;
	startedAt: Date | null;
	finishedAt: Date | null;
	outcome: string | null;
	lastError: string | null;
};

export function agentTaskState(
	task: AgentTaskStateInput | null,
	now = new Date(),
): { status: "idle" | "queued" | "running" | "retrying" | "failed"; error: string | null } {
	if (!task) return { status: "idle", error: null };
	if (task.finishedAt) {
		return task.lastError
			? { status: "failed", error: task.lastError }
			: { status: "idle", error: null };
	}
	if (task.outcome?.startsWith(RETRYING_OUTCOME_PREFIX)) {
		return { status: "retrying", error: task.lastError };
	}
	if (task.startedAt) return { status: "running", error: null };
	if (task.dueAt.getTime() > now.getTime()) return { status: "idle", error: null };
	return { status: "queued", error: null };
}
```

`dueAt` is the persisted scheduling contract; never infer state from `leasedUntil`.

- [ ] **Step 4: Write failing integration tests for task transitions and concurrency**

In `apps/agent/test/tasks.integration.spec.ts`, add tests that:

- create one task and call `failTask`, asserting unfinished + retrying outcome + `lastError`;
- claim the retry and assert outcome clears to running while `lastError` remains historical;
- call `completeTask` and assert `lastError` clears, the current row finishes, and one future recurrence is created in the same transaction;
- call `scheduleTask` concurrently ten times for one acquisition target and assert one unfinished row and one returned task ID;
- request an immediate refresh while a future recurrence exists and assert the existing row moves to `dueAt = now` instead of duplicating.

- [ ] **Step 5: Run the integration test and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/tasks.integration.spec.ts`

Expected: FAIL because failure persistence and conflict recovery are incomplete.

- [ ] **Step 6: Implement atomic task transitions and unique-conflict recovery**

Update `claimDue`, `failTask`, `completeTask`, `retireExhausted`, and `scheduleTask` so:

```ts
const RETRYING_OUTCOME_PREFIX = "retrying:";

data: {
	dueAt: retryAt,
	leasedUntil: null,
	lastError: reason.slice(0, 500),
	outcome: `${RETRYING_OUTCOME_PREFIX} ${reason}`.slice(0, 500),
}
```

Successful completion clears `lastError`. For acquisition task kinds, the same transaction finishes the current row and creates the next recurrence using `ACQUISITION_TASK_INTERVAL_MS`. A terminal failure sets both `finishedAt` and `lastError` and does not create a recurrence. `scheduleTask` and `AgentTriggerService.enqueue` catch Prisma `P2002`, then read and return the existing unfinished task rather than creating a duplicate. When an existing task has not started and is due in the future, an explicit request brings its `dueAt`, reason, priority, and budget forward; a running task remains untouched.

- [ ] **Step 7: Verify focused task tests GREEN**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test packages/db/test/agent-tasks.spec.ts
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/tasks.integration.spec.ts
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/agent-trigger.spec.ts
bun run --filter=agent check-types
bun run --filter=api check-types
```

Expected: all focused tests and type checks pass.

- [ ] **Step 8: Commit durable task state**

```bash
git add packages/db/src/agent-tasks.ts packages/db/test/agent-tasks.spec.ts apps/agent/agent/lib/tasks.ts apps/agent/test/tasks.integration.spec.ts apps/api/src/agent/agent-trigger.service.ts apps/api/test/agent-trigger.spec.ts
git commit -m "fix(agent): make acquisition task state durable"
```

---

### Task 3: Canonical target queries and dashboard semantics

**Files:**
- Create: `apps/api/src/acquisition/acquisition-where.ts`
- Create: `apps/api/test/acquisition-dashboard.integration.spec.ts`
- Modify: `apps/api/src/companies/companies.contracts.ts`
- Modify: `apps/api/src/companies/companies.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/acquisition-summary.ts`
- Modify: `apps/api/test/acquisition-profile.spec.ts`

**Interfaces:**
- Consumes: `ACTIVE_ACQUISITION_STAGES`, `ACQUISITION_TASK_KINDS`, `AcquisitionTargetView`, and `targetStages()`.
- Produces: `companyTargetWhere(view, baseCompanyWhere)` and `acquisitionTargetWhere(view, companyWhere)` as the only Prisma target-scope builders.
- Produces: `companyListInput.targetView` with `active | rejected | acquired | history`, defaulting to `active` when the workspace is in acquisition mode and ignored in sales mode.

- [ ] **Step 1: Write failing predicate tests**

Extend `apps/api/test/acquisition-profile.spec.ts` to prove:

```ts
expect(companyTargetWhere("active", { ownerId: "viewer" })).toEqual({
	AND: [
		{ ownerId: "viewer" },
		{ acquisitionTarget: { is: { stage: { in: [...ACTIVE_ACQUISITION_STAGES] } } } },
	],
});
expect(acquisitionTargetWhere("rejected", { ownerId: "viewer" })).toEqual({
	stage: AcquisitionStage.REJECTED,
	company: { is: { ownerId: "viewer" } },
});
```

- [ ] **Step 2: Run predicate tests and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/acquisition-profile.spec.ts`

Expected: FAIL because the canonical where builders do not exist.

- [ ] **Step 3: Implement canonical query predicates**

Create `acquisition-where.ts` with exact stage mappings from the shared module. Replace local target-stage construction in dashboard and company list queries.

- [ ] **Step 4: Write failing database regression tests**

Create fixtures for:

- one generic company with no target;
- one active target;
- one rejected target;
- one acquired target;
- one active target owned by another user;
- one target with generic enrichment complete but no dossier.

Assert that the acquisition dashboard and company list:

- exclude the generic company from target totals and rows;
- scope through company owner;
- exclude rejected/acquired from the default list;
- include them through the corresponding historical view;
- count the no-dossier target as needs research regardless of enrichment;
- count only acquisition task kinds as active Eve work.

- [ ] **Step 5: Run the database test and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/acquisition-dashboard.integration.spec.ts`

Expected: FAIL because dashboard metrics still begin from `Company` and list queries do not require a target.

- [ ] **Step 6: Implement target-first list and dashboard queries**

Load workspace mode once in `CompaniesService.list`. Apply `companyTargetWhere` only in acquisition mode, including facet-count bases. Change dashboard counts to `db.acquisitionTarget.count` and use `researchedAt: null` as the only needs-research predicate.

Count active acquisition work with:

```ts
this.db.agentTask.count({
	where: {
		kind: { in: [...ACQUISITION_TASK_KINDS] },
		finishedAt: null,
	},
});
```

- [ ] **Step 7: Verify target query tests GREEN**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/acquisition-profile.spec.ts
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/acquisition-dashboard.integration.spec.ts
bun run --filter=api check-types
```

Expected: focused tests and API type checking pass.

- [ ] **Step 8: Commit target query semantics**

```bash
git add apps/api/src/acquisition/acquisition-where.ts apps/api/src/companies/companies.contracts.ts apps/api/src/companies/companies.service.ts apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/acquisition-summary.ts apps/api/test/acquisition-profile.spec.ts apps/api/test/acquisition-dashboard.integration.spec.ts
git commit -m "fix(api): derive acquisition views from targets"
```

---

### Task 4: Atomic target creation, promotion, and research gating

**Files:**
- Modify: `apps/api/src/acquisition/acquisition.contracts.ts`
- Modify: `apps/api/src/acquisition/acquisition.module.ts`
- Modify: `apps/api/src/acquisition/acquisition.router.ts`
- Modify: `apps/api/src/acquisition/acquisition.service.ts`
- Modify: `apps/api/src/companies/companies.service.ts`
- Modify: `apps/api/src/agent/agent-trigger.service.ts`
- Modify: `apps/api/src/generated/server.ts`
- Modify: `apps/api/test/acquisition.integration.spec.ts`

**Interfaces:**
- Produces: `acquisition.createTarget(input)` for atomic manual company + target creation.
- Produces: `acquisition.addTarget({ companyId })` for promoting an existing company.
- Produces: `TargetResearchResult = { status: "queued"; taskId: string } | { status: "blocked"; blocker: "missing-domain" | "missing-buy-box" } | { status: "failed"; blocker: "queue-unavailable" }`.
- Produces: target creation response `{ companyId, created, targetCreated, stage, research }`.

- [ ] **Step 1: Write failing target mutation tests**

Extend `apps/api/test/acquisition.integration.spec.ts` with tests for:

- manual create atomically producing `Company` + `AcquisitionTarget`;
- existing company promotion preserving every populated company field;
- missing domain returning `blocked: missing-domain` with stage `DISCOVERED`;
- missing buy-box focus returning `blocked: missing-buy-box`;
- valid prerequisites returning one task and stage `RESEARCHING`;
- twenty concurrent `addTarget` calls returning one target and one active refresh task;
- concurrent candidate approvals converging on the same company, target, and task.

- [ ] **Step 2: Run the acquisition integration test and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/acquisition.integration.spec.ts`

Expected: FAIL because create/promote mutations and truthful queue results are absent.

- [ ] **Step 3: Implement target readiness as one service seam**

Add one private acquisition service function that reads domain and focused buy box, queues through the durable task service, and updates lifecycle only after queue confirmation:

```ts
private async queueResearch(companyId: string, actingUserId: string): Promise<TargetResearchResult> {
	const readiness = await this.targetReadiness(companyId);
	if (readiness.blocker) return { status: "blocked", blocker: readiness.blocker };
	const queued = await this.agent.acquisitionTargetRequested(
		companyId,
		`Acquisition analysis requested by a rep (${actingUserId})`,
	);
	if (!queued) return { status: "failed", blocker: "queue-unavailable" };
	await this.db.acquisitionTarget.update({
		where: { companyId },
		data: { stage: AcquisitionStage.RESEARCHING },
	});
	return { status: "queued", taskId: queued.taskId };
}
```

Import `AgentModule` into `AcquisitionModule`, inject `AgentTriggerService` into `AcquisitionService`, and route manual creation, promotion, and candidate approval through the same target-upsert and readiness logic.

- [ ] **Step 4: Make company + target creation transactional**

Extend the internal `CompaniesService.create` seam with an optional acquisition target payload so `AcquisitionService.createTarget` can create both records in one database transaction without duplicating company normalization, conflict translation, detail-queueing, or favicon behavior.

- [ ] **Step 5: Generate committed tRPC types**

Run: `bun run --filter=api trpc:generate`

Expected: `apps/api/src/generated/server.ts` contains `acquisition.createTarget` and `acquisition.addTarget` procedures.

- [ ] **Step 6: Verify target mutation tests GREEN**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/acquisition.integration.spec.ts
bun run --filter=api check-types
```

Expected: integration tests and API type checking pass.

- [ ] **Step 7: Commit target mutations**

```bash
git add apps/api/src/acquisition/acquisition.contracts.ts apps/api/src/acquisition/acquisition.module.ts apps/api/src/acquisition/acquisition.router.ts apps/api/src/acquisition/acquisition.service.ts apps/api/src/companies/companies.service.ts apps/api/src/agent/agent-trigger.service.ts apps/api/src/generated/server.ts apps/api/test/acquisition.integration.spec.ts
git commit -m "feat(api): add durable acquisition target promotion"
```

---

### Task 5: Deterministic Eve criteria and atomic dossier writes

**Files:**
- Create: `apps/agent/agent/lib/acquisition-criteria.ts`
- Create: `apps/agent/test/acquisition-dossier.integration.spec.ts`
- Modify: `apps/agent/agent/tools/write_acquisition_dossier.ts`
- Modify: `apps/agent/agent/tools/propose_acquisition_candidates.ts`
- Modify: `apps/agent/agent/instructions.md`
- Modify: `apps/agent/test/agent-tool-contracts.spec.ts`

**Interfaces:**
- Consumes: shared criterion IDs/results and `expectedAcquisitionCriterionIds(profile)`.
- Produces: `validateCriterionAssessments(expectedIds, assessments): { ok: true } | { ok: false; reason: string }`.
- Produces: dossier tool input `criteria: AcquisitionCriterionAssessment[]` with exact ordered identity.
- Produces: one canonical candidate batch limit of ten.

- [ ] **Step 1: Read the installed Eve tool guide**

Run: `sed -n '1,320p' apps/agent/node_modules/eve/docs/tools/overview.mdx`

Expected: confirm the installed `defineTool` input and execute contract before editing.

- [ ] **Step 2: Write failing tool-contract tests**

Extend `agent-tool-contracts.spec.ts` to assert:

- exactly ten candidates validate;
- eleven candidates fail schema validation;
- `MATCH`, `PARTIAL`, and `CONCERN` without evidence fail;
- `UNKNOWN` without evidence validates;
- `blocksQualification: true` fails for non-`UNKNOWN` results.

- [ ] **Step 3: Run contract tests and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/agent-tool-contracts.spec.ts`

Expected: FAIL on the old 20-candidate limit and absent criteria schema.

- [ ] **Step 4: Implement the criterion schema and identity validator**

Use Zod `superRefine` for evidence and blocker rules. Compare IDs by length and index, returning a reason that includes expected and received IDs. Do not sort model output before validation because order is part of the contract.

- [ ] **Step 5: Write failing atomic-write integration tests**

Create a target with dossier A and timestamp A. Execute the tool with duplicate, missing, reordered, and invented criterion IDs and assert every acquisition field and timestamp still equals A. Then execute valid dossier B and assert criteria, summary, findings, recommendation, activity, and timestamp B commit together.

- [ ] **Step 6: Run dossier integration tests and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/acquisition-dossier.integration.spec.ts`

Expected: FAIL because the current tool accepts no criteria and cannot enforce exact coverage.

- [ ] **Step 7: Implement the pre-transaction validation and atomic write**

Select every buy-box field required by `expectedAcquisitionCriterionIds`. Validate before calling `db.$transaction`. Inside the existing transaction, write all dossier fields including `criteria`, create the activity, update `lastActivityAt`, and set one `researchedAt` value.

Include criterion evidence URLs in the deduplicated `sourceUrls` set.

Remove weekly and 30-day `scheduleTask` calls from the two acquisition tools. Task 2 owns recurrence after successful task completion so the active-task uniqueness invariant is never bypassed.

- [ ] **Step 8: Standardize discovery instructions at ten**

Change Eve's instruction and `propose_acquisition_candidates` schema from twenty to ten. Keep the review-queue and no-auto-create rules unchanged.

- [ ] **Step 9: Verify Eve tests and build GREEN**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/agent-tool-contracts.spec.ts
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/agent/test/acquisition-dossier.integration.spec.ts
bun run --filter=agent check-types
bun run --filter=agent build
```

Expected: focused tests, type checking, and Eve build pass.

- [ ] **Step 10: Commit deterministic dossier writes**

```bash
git add apps/agent/agent/lib/acquisition-criteria.ts apps/agent/agent/tools/write_acquisition_dossier.ts apps/agent/agent/tools/propose_acquisition_candidates.ts apps/agent/agent/instructions.md apps/agent/test/acquisition-dossier.integration.spec.ts apps/agent/test/agent-tool-contracts.spec.ts
git commit -m "feat(agent): write deterministic acquisition dossiers"
```

---

### Task 6: Acquisition dossier read model and research state API

**Files:**
- Modify: `apps/api/src/agent/agent-queue.service.ts`
- Modify: `apps/api/src/companies/companies.service.ts`
- Modify: `apps/api/test/acquisition.integration.spec.ts`
- Modify: `apps/api/test/agent-trigger.spec.ts`

**Interfaces:**
- Consumes: `agentTaskState`, `AcquisitionTarget.criteria`, and `acquisition-refresh` task identity.
- Produces: `AgentQueueService.acquisitionResearchState(companyId)`.
- Produces: `companies.byId.acquisitionResearch = { status, error }` independently of `enrichmentStatus` and `queuedKinds`.
- Produces: parsed dossier criteria with invalid legacy JSON reduced to an empty safe list.

- [ ] **Step 1: Write failing research-state API tests**

Create dossier A, then persist each task shape and call `companies.byId`:

```ts
expect(record.acquisitionResearch).toEqual({ status: "queued", error: null });
expect(record.acquisitionTarget?.researchedAt).toBe(timestampA);
```

Repeat for running, retrying, and failed. Assert dossier A and timestamp A remain identical for all states. Add a successful completed task and assert the state becomes idle.

- [ ] **Step 2: Run focused API tests and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/acquisition.integration.spec.ts`

Expected: FAIL because `companies.byId` exposes only generic queue state.

- [ ] **Step 3: Implement latest acquisition task state**

Query the latest `acquisition-refresh` task by `createdAt desc` and feed only persisted fields plus one request-scoped `now` value to `agentTaskState`. Use `dueAt` only to distinguish a future recurrence from work that is ready now; do not use `leasedUntil` or `Company.enrichmentStatus`.

- [ ] **Step 4: Parse criteria defensively**

Add a parser beside `parseDossierFindings` that accepts only stable criterion IDs, stable result values, a non-empty explanation, boolean blocker, and valid source objects. Return an empty list for malformed legacy data rather than throwing the whole company sheet.

- [ ] **Step 5: Verify API read-model tests GREEN**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/acquisition.integration.spec.ts
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/api/test/agent-trigger.spec.ts
bun run --filter=api check-types
```

Expected: focused tests and API type checking pass.

- [ ] **Step 6: Commit the acquisition read model**

```bash
git add apps/api/src/agent/agent-queue.service.ts apps/api/src/companies/companies.service.ts apps/api/test/acquisition.integration.spec.ts apps/api/test/agent-trigger.spec.ts
git commit -m "feat(api): expose acquisition research state"
```

---

### Task 7: Target index, promotion UX, and decision-first dossier

**Files:**
- Create: `apps/app/components/crm/acquisition-dossier.tsx`
- Create: `apps/app/lib/acquisition.ts`
- Create: `apps/app/test/acquisition.spec.ts`
- Modify: `apps/app/app/(app)/[slug]/companies/page.tsx`
- Modify: `apps/app/app/(app)/[slug]/companies/companies-search-params.ts`
- Modify: `apps/app/app/(app)/[slug]/companies/companies-table.tsx`
- Modify: `apps/app/app/(app)/[slug]/companies/create-company-sheet.tsx`
- Modify: `apps/app/components/crm/record-sheet/company-sheet.tsx`
- Modify: `apps/app/components/workspace-section-heading.tsx`
- Modify: `apps/app/lib/trpc/cache.ts`

**Interfaces:**
- Consumes: `companies.list.targetView`, `acquisition.createTarget`, `acquisition.addTarget`, dossier criteria, and `acquisitionResearch`.
- Produces: `defaultCompanyTab(company, acquisitionMode)`, `criterionGroups(criteria)`, and `targetResearchCopy(state)` pure presentation helpers.
- Produces: `CrmCache.acquisition(companyId?, options?)` as the one invalidation seam for target mutations, covering company detail, target list, and acquisition dashboard queries.
- Produces: a target-specific table and extracted dossier component using existing shared UI primitives.

- [ ] **Step 1: Write failing presentation tests**

Before composing the UI, inspect the exact local shared primitives and resolve current component docs:

```bash
sed -n '1,260p' packages/ui/src/components/alert.tsx
sed -n '1,260p' packages/ui/src/components/button.tsx
sed -n '1,320p' packages/ui/src/components/select.tsx
sed -n '1,260p' packages/ui/src/components/tooltip.tsx
bunx --bun shadcn@latest docs alert button select tooltip
```

Create `apps/app/test/acquisition.spec.ts` to prove:

- a real target defaults to `acquisition` and a non-target defaults to `overview`;
- blocking unknowns are grouped ahead of other unknowns;
- queued/running/retrying/failed copy never changes or claims the successful research timestamp;
- a blocked promotion maps to `Add a domain` or `Complete the buy box`.

- [ ] **Step 2: Run app tests and verify RED**

Run: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/app/test/acquisition.spec.ts`

Expected: FAIL because the pure presentation helpers do not exist.

- [ ] **Step 3: Implement pure presentation helpers**

Keep labels and state mapping outside React so tests cover every branch. Use sentence case and verb-first actions.

- [ ] **Step 4: Add lifecycle URL state and target table columns**

Configure `companiesSearchParams` with `tabId: "targetView"`. Keep the DataTable's raw `all` value for its primary tab, but override `toInput` so both server prefetch and client queries normalize `all` to API value `active`:

```ts
const base = createListSearchParams({
	defaultSort: "createdAt",
	defaultDir: "desc",
	tabId: "targetView",
	facetIds: ["owner", "industry", "enrichment"] as const,
});

export const companiesSearchParams = {
	...base,
	toInput: (values: Parameters<typeof base.toInput>[0]) => {
		const input = base.toInput(values);
		return {
			...input,
			targetView: input.targetView === "all" ? "active" : input.targetView,
		};
	},
};
```

Present the DataTable's `allLabel` as Active, with Rejected, Acquired, and History options in acquisition mode. Keep sales mode table behavior unchanged.

Replace the static companies metadata with `generateMetadata` that reads the cached workspace mode and returns `Targets` in acquisition mode or `Companies` in sales mode. Keep the `/companies` route unchanged.

For acquisition mode, compose columns in this order:

1. Target
2. Fit
3. Lifecycle
4. Recommended next action
5. Last successful research
6. Owner

Do not alter generic `Company` fields or compatibility routes.

- [ ] **Step 5: Route manual creation through the target mutation**

Add `CrmCache.acquisition` in `apps/app/lib/trpc/cache.ts`, invalidating `companies.byId`, `companies.list`, and `dashboard.summary` through one safe call. In `CreateCompanySheet`, use `acquisition.createTarget` when `labels.acquisition` is true and `companies.create` otherwise. On success, call `cache.acquisition(companyId)`, then surface queued or blocked research truthfully.

- [ ] **Step 6: Make real targets open into Acquisition without effects**

Move the company query before `useRecordSheetView` and derive the fallback directly:

```ts
const fallbackTab = defaultCompanyTab(query.data, labels.acquisition);
const view = useRecordSheetView(fallbackTab);
```

Because `useRecordSheetView` derives `tab ?? fallbackTab` every render, hydrated query data updates the fallback without `useEffect`.

Render an explicit `Add to targets` action for non-target companies instead of fallback fit/stage values.

- [ ] **Step 7: Extract and build the decision-first dossier**

Move the acquisition tab into `acquisition-dossier.tsx`. Use existing `DetailSheetSection`, `StatusIndicator`, `Alert`, `Tooltip`, `Link`, `Button`, and properties primitives.

Order the surface as:

1. fit beside the matching matrix;
2. last successful research plus separate current task state;
3. criterion explanations, sources, and qualification blockers;
4. assessment, strengths, concerns, and unknowns;
5. recommended action;
6. lifecycle select with a `Manually controlled` tooltip.

Keep dossier content mounted and visible for queued, running, retrying, and failed refresh states. Failed state offers `Retry research`; missing domain and buy-box states link to their corrective actions.

In acquisition mode, label the existing company-sheet tabs with `labels.deals`, `Timeline`, and `Eve`; retain Deals, Activity, and Agent in sales mode.

- [ ] **Step 8: Verify app tests, types, and lint GREEN**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun test apps/app/test/acquisition.spec.ts
bun run --filter=app check-types
bun run --filter=app lint
```

Expected: focused tests, app type checking, and app lint pass.

- [ ] **Step 9: Commit the target experience**

```bash
git add 'apps/app/app/(app)/[slug]/companies/page.tsx' 'apps/app/app/(app)/[slug]/companies/companies-search-params.ts' 'apps/app/app/(app)/[slug]/companies/companies-table.tsx' 'apps/app/app/(app)/[slug]/companies/create-company-sheet.tsx' apps/app/components/crm/acquisition-dossier.tsx apps/app/components/crm/record-sheet/company-sheet.tsx apps/app/components/workspace-section-heading.tsx apps/app/lib/acquisition.ts apps/app/lib/trpc/cache.ts apps/app/test/acquisition.spec.ts
git commit -m "feat(app): make acquisition dossiers decision-first"
```

---

### Task 8: Full regression and local authenticated verification

**Files:**
- Modify only files needed to correct failures found by the complete verification suite.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: repository-level evidence and a local browser evidence record for the frozen acceptance criterion.

- [ ] **Step 1: Run the complete repository checks**

Run each command separately and retain its exit status:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun run lint
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun run check-types
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun run test
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun run build
git diff --check
```

Expected: all commands exit 0. Report existing warnings separately rather than calling warning-bearing output clean.

- [ ] **Step 2: Fix failures with focused red-green cycles**

For each failure, add or tighten the smallest test that reproduces it, run that test RED, make the minimal correction, run it GREEN, then rerun the failed repository command.

- [ ] **Step 3: Start the local product and verify process ownership**

Inspect listeners on 3000, 3001, and 2000 before starting anything. Reuse a matching healthy process or start `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm" bun run dev`; never kill an unidentified process.

- [ ] **Step 4: Verify the authenticated golden path in the browser**

Use the available authenticated in-app browser session. Verify:

- Targets excludes a seeded non-target company.
- Active, Rejected, Acquired, and History views return the expected records.
- A generic company remains usable and promotes without data loss.
- A real target opens on Acquisition.
- Fit and criterion reasoning are adjacent and sources open safely.
- Blocking unknowns are distinct.
- Refresh preserves dossier A and its timestamp during queued/running/retrying/failed states.
- Retry produces dossier B and only then advances `researchedAt`.
- Lifecycle state is visible and manually editable.
- Desktop and narrow-width layouts contain no clipping or inaccessible controls.
- No Next.js error overlay or relevant console error appears.

- [ ] **Step 5: Commit any verification-only corrections**

If verification required changes, return to the owning task's explicit file list, repeat its focused RED/GREEN checks, stage only those known files, and commit with that task's subject. If no files changed, do not create an empty commit.

---

### Task 9: Production migration, Vercel deployment, and live evidence

**Files:**
- No source changes expected. Modify source only through a new focused TDD cycle if deployment reveals a real defect.

**Interfaces:**
- Consumes: a fully verified commit and the linked Vercel projects `vault-zero-crm-agent`, `vault-zero-crm-api`, and `vault-zero-crm`.
- Produces: separate evidence for migration, Vercel readiness, provider execution, and authenticated production behavior.

- [ ] **Step 1: Confirm the exact release commit and clean worktree**

Run:

```bash
git status --short
git rev-parse --short HEAD
git log -1 --oneline
```

Expected: no uncommitted implementation files and a known release commit.

- [ ] **Step 2: Inspect Vercel linkage and environment presence without values**

Run:

```bash
vercel env ls production --cwd apps/agent
vercel env ls production --cwd apps/api
vercel env ls production --cwd apps/app
```

Confirm `DATABASE_URL`, agent bridge, auth, and provider variable names are present where required. Never print, copy, or retain their values.

- [ ] **Step 3: Apply the production migration from an inert temporary environment file**

Run:

```bash
release_tmp_dir="$(mktemp -d)"
case "$release_tmp_dir" in
	/tmp/*|/private/tmp/*|/var/folders/*) ;;
	*) exit 1 ;;
esac
api_env_file="$release_tmp_dir/api-production.env"
vercel env pull "$api_env_file" --yes --environment=production --cwd apps/api
bun --env-file "$api_env_file" run db:deploy
```

Expected: Prisma reports the new migration applied or already present. This proves migration acceptance, not application behavior.

- [ ] **Step 4: Create preview deployments in dependency order**

Run and retain the immutable URLs without printing environment contents:

```bash
agent_preview_url="$(vercel deploy --yes --cwd apps/agent 2>&1 | tee "$release_tmp_dir/agent-deploy.log" | awk '/^https:\/\//{url=$0} END{print url}')"
api_preview_url="$(vercel deploy --yes --cwd apps/api 2>&1 | tee "$release_tmp_dir/api-deploy.log" | awk '/^https:\/\//{url=$0} END{print url}')"
app_preview_url="$(vercel deploy --yes --cwd apps/app 2>&1 | tee "$release_tmp_dir/app-deploy.log" | awk '/^https:\/\//{url=$0} END{print url}')"
test -n "$agent_preview_url"
test -n "$api_preview_url"
test -n "$app_preview_url"
```

Record each immutable preview URL and inspect it with `vercel inspect`. Do not claim production readiness from a `READY` status alone.

- [ ] **Step 5: Smoke-test preview service boundaries**

Verify the agent info route with its expected authenticated boundary, API health, app sign-in route, and app-to-API/agent bridge. Scan preview runtime logs for new errors.

- [ ] **Step 6: Promote the exact previews to production**

Promote in order:

```bash
vercel promote "$agent_preview_url" --yes --cwd apps/agent
vercel promote "$api_preview_url" --yes --cwd apps/api
vercel promote "$app_preview_url" --yes --cwd apps/app
```

Record production aliases and deployment IDs. Promotion proves aliasing of the tested artifacts, not the complete workflow.

- [ ] **Step 7: Run the authenticated production golden path**

Using the production domain and authenticated browser session, repeat the Task 8 golden path with a bounded test target. Do not use or overwrite real customer data. Capture screenshots of Targets, the dossier matrix, refresh-in-progress with dossier A preserved, and the final dossier B or truthful failure state.

- [ ] **Step 8: Collect provider and post-deploy evidence**

Confirm whether the acquisition task was claimed, whether Eve completed, and whether configured providers returned usable evidence. Scan Vercel logs for each production deployment and distinguish missing optional capability from runtime failure.

- [ ] **Step 9: Report each independent result**

After evidence collection, remove only the validated temporary directory:

```bash
case "$release_tmp_dir" in
	/tmp/*|/private/tmp/*|/var/folders/*) rm -rf -- "$release_tmp_dir" ;;
	*) exit 1 ;;
esac
```

Use this release report structure:

```md
## Release evidence

- Repository checks: PASS | FAIL with command evidence
- Database migration: APPLIED | ALREADY PRESENT | FAILED
- Vercel deployments: READY | ERROR for agent, API, and app with URLs and commit
- Eve/providers: COMPLETED | PARTIAL | FAILED | NOT CONFIGURED
- Authenticated golden path: PASS | PARTIAL | FAIL with steps observed
- Remaining risks: exact unverified boundaries only
```

Do not collapse partial provider or authenticated-flow results into an overall success claim.
