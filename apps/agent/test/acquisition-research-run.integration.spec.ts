import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { AcquisitionFit, AcquisitionStage, db, WorkspaceMode } from "@crm/db";
import { AcquisitionResearchRunStatus } from "@crm/db/enums";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { acquireCanonicalWorkspaceFixture } from "../../../packages/db/test/canonical-workspace-fixture";
import {
	ensureAcquisitionResearchRun,
	noteAcquisitionResearchSession,
	succeedAcquisitionResearchRun,
} from "../agent/lib/acquisition-research-run";
import { markRunning } from "../agent/lib/enrichment";
import {
	claimDue,
	completeTask,
	DIRECT_KINDS,
	failTask,
	MAX_ATTEMPTS,
	retireExhausted,
} from "../agent/lib/tasks";
import writeAcquisitionDossier from "../agent/tools/write_acquisition_dossier";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const domain = `acquisition-research-run-${suffix}.test`;
const userEmail = `acquisition-research-run-${suffix}@example.test`;
const userId = `acquisition-research-run-user-${suffix}`;
const sessionId = `acquisition-research-run-session-${suffix}`;

let companyId: string;
let releaseCanonicalWorkspace: (() => Promise<void>) | undefined;

const validCriteria = [
	{
		id: "industry" as const,
		result: "MATCH" as const,
		explanation: "The company provides a preferred recurring service.",
		blocksQualification: false,
		evidence: [
			{
				label: "Recurring maintenance services",
				url: "https://candidate.example.test/services",
			},
		],
	},
	{
		id: "geography" as const,
		result: "PARTIAL" as const,
		explanation: "The company serves part of the preferred geography.",
		blocksQualification: false,
		evidence: [
			{
				label: "Regional service locations",
				url: "https://candidate.example.test/locations",
			},
		],
	},
	{
		id: "revenue" as const,
		result: "UNKNOWN" as const,
		explanation: "No reliable source states annual company revenue.",
		blocksQualification: true,
		evidence: [],
	},
];

const dossierInput = {
	fit: AcquisitionFit.POTENTIAL,
	summary:
		"Dossier B finds credible buy-box alignment while leaving revenue verification explicit.",
	strengths: [
		{
			summary:
				"The company provides a preferred recurring maintenance service.",
			evidence: [
				{
					label: "Recurring maintenance services",
					url: "https://candidate.example.test/services",
				},
			],
		},
	],
	concerns: [
		{
			summary: "The available material does not establish low concentration.",
			evidence: [
				{
					label: "Customer portfolio overview",
					url: "https://candidate.example.test/customers",
				},
			],
		},
	],
	missingInformation: ["Verified annual revenue"],
	recommendedAction: "Request normalized financial statements from the owner.",
	recommendedStage: AcquisitionStage.WATCHLIST,
	criteria: validCriteria,
};

beforeAll(async () => {
	releaseCanonicalWorkspace = await acquireCanonicalWorkspaceFixture();
	await cleanup();
	await db.acquisitionProfile.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			mode: WorkspaceMode.ACQUISITION,
			preferredIndustries: ["Commercial services"],
			geographies: ["Midwest"],
			excludedCategories: [],
			currency: "USD",
			revenueMin: 1_000_000,
		},
		update: {
			mode: WorkspaceMode.ACQUISITION,
			preferredIndustries: ["Commercial services"],
			geographies: ["Midwest"],
			revenueMin: 1_000_000,
		},
	});
	await db.user.create({
		data: {
			id: userId,
			name: "Research Run Owner",
			email: userEmail,
			emailVerified: true,
		},
	});
	const company = await db.company.create({
		data: {
			name: `Research Run Target ${suffix}`,
			domain,
			ownerId: userId,
			acquisitionTarget: {
				create: {
					stage: AcquisitionStage.QUALIFIED,
					fit: AcquisitionFit.WEAK,
					summary:
						"Dossier A remains the last complete acquisition assessment.",
					strengths: [],
					concerns: [],
					criteria: validCriteria,
					missingInformation: ["Prior revenue gap"],
					recommendedAction: "Keep the prior dossier unchanged.",
					recommendedStage: AcquisitionStage.WATCHLIST,
					sourceUrls: ["https://prior.example.test/dossier"],
					researchedAt: new Date("2026-01-15T12:00:00.000Z"),
					sourceSessionId: "dossier-a-session",
				},
			},
		},
		select: { id: true },
	});
	companyId = company.id;
}, 120_000);

beforeEach(async () => {
	await db.acquisitionResearchRun.deleteMany({ where: { companyId } });
	await db.agentTask.deleteMany({ where: { companyId } });
});

afterAll(async () => {
	try {
		await cleanup();
	} finally {
		await releaseCanonicalWorkspace?.();
	}
});

async function cleanup(): Promise<void> {
	const companies = await db.company.findMany({
		where: { domain },
		select: { id: true },
	});
	const companyIds = companies.map((company) => company.id);
	if (companyIds.length === 0) return;

	await db.acquisitionResearchRun.deleteMany({
		where: { companyId: { in: companyIds } },
	});
	await db.agentTask.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.activity.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.acquisitionTarget.deleteMany({
		where: { companyId: { in: companyIds } },
	});
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.user.deleteMany({ where: { email: userEmail } });
}

async function queueRefresh(reason: string) {
	return db.agentTask.create({
		data: {
			companyId,
			kind: "acquisition-refresh",
			reason,
			dueAt: new Date(Date.now() - 1000),
			priority: 300,
			budget: 12,
		},
		select: { id: true, reason: true },
	});
}

describe("acquisition research runs", () => {
	it("creates exactly one run when execution begins", async () => {
		const task = await queueRefresh(
			`Acquisition analysis requested by a rep (${userId})`,
		);
		const [claimed] = await claimDue(1, { except: DIRECT_KINDS });
		expect(claimed?.id).toBe(task.id);
		if (!claimed) throw new Error("expected claimed task");

		await markRunning(claimed);
		const first = await ensureAcquisitionResearchRun(claimed);
		const second = await ensureAcquisitionResearchRun(claimed);

		expect(first).toBeTruthy();
		expect(second).toBe(first);

		const runs = await db.acquisitionResearchRun.findMany({
			where: { companyId },
		});
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			agentTaskId: task.id,
			kind: "acquisition-refresh",
			status: AcquisitionResearchRunStatus.RUNNING,
			triggeredById: userId,
		});
	});

	it("does not duplicate a run when the same task is reclaimed after retry", async () => {
		const task = await queueRefresh("Scheduled acquisition refresh");
		await db.agentTask.update({
			where: { id: task.id },
			data: {
				attempts: 2,
				startedAt: new Date(),
				lastError: "provider timeout",
				outcome: "retrying: provider timeout",
			},
		});

		const leased = {
			id: task.id,
			contactId: null,
			companyId,
			organizationId: WORKSPACE_ID,
			kind: "acquisition-refresh",
			reason: "Scheduled acquisition refresh",
			budget: 12,
			attempts: 2,
			priority: 300,
			dueAt: new Date(Date.now() - 1000),
		};

		await ensureAcquisitionResearchRun(leased);
		await ensureAcquisitionResearchRun(leased);

		expect(
			await db.acquisitionResearchRun.count({
				where: { agentTaskId: task.id },
			}),
		).toBe(1);
	});

	it("marks the run succeeded with a validated snapshot when the dossier commits", async () => {
		const task = await queueRefresh("Scheduled acquisition refresh");
		await db.agentTask.update({
			where: { id: task.id },
			data: { sessionId },
		});
		await ensureAcquisitionResearchRun({
			id: task.id,
			contactId: null,
			companyId,
			organizationId: WORKSPACE_ID,
			kind: "acquisition-refresh",
			reason: "Scheduled acquisition refresh",
			budget: 12,
			attempts: 1,
			priority: 300,
			dueAt: new Date(Date.now() - 1000),
		});
		await noteAcquisitionResearchSession(task.id, sessionId);

		const result = await writeAcquisitionDossier.execute(
			{ ...dossierInput, companyId },
			{ session: { id: sessionId } } as never,
		);
		expect(result.written).toBe(true);

		const run = await db.acquisitionResearchRun.findUniqueOrThrow({
			where: { agentTaskId: task.id },
		});
		expect(run.status).toBe(AcquisitionResearchRunStatus.SUCCEEDED);
		expect(run.finishedAt).not.toBeNull();
		expect(run.dossierSnapshot).toMatchObject({
			fit: AcquisitionFit.POTENTIAL,
			summary: dossierInput.summary,
			sourceSessionId: sessionId,
		});
	});

	it("marks the run failed when retries are exhausted and leaves dossier A intact", async () => {
		const prior = await db.acquisitionTarget.findUniqueOrThrow({
			where: { companyId },
		});
		const task = await queueRefresh("Scheduled acquisition refresh");
		await db.agentTask.update({
			where: { id: task.id },
			data: { attempts: MAX_ATTEMPTS },
		});
		await ensureAcquisitionResearchRun({
			id: task.id,
			contactId: null,
			companyId,
			organizationId: WORKSPACE_ID,
			kind: "acquisition-refresh",
			reason: "Scheduled acquisition refresh",
			budget: 12,
			attempts: MAX_ATTEMPTS,
			priority: 300,
			dueAt: new Date(Date.now() - 1000),
		});

		const result = await failTask(task.id, "provider timeout");
		expect(result?.retrying).toBe(false);

		const run = await db.acquisitionResearchRun.findUniqueOrThrow({
			where: { agentTaskId: task.id },
		});
		expect(run.status).toBe(AcquisitionResearchRunStatus.FAILED);
		expect(run.outcome).toBe("provider timeout");

		const target = await db.acquisitionTarget.findUniqueOrThrow({
			where: { companyId },
		});
		expect(target.summary).toBe(prior.summary);
		expect(target.fit).toBe(prior.fit);
		expect(target.researchedAt?.toISOString()).toBe(
			prior.researchedAt?.toISOString(),
		);
	});

	it("marks abandoned tasks failed through retireExhausted", async () => {
		const task = await queueRefresh("Scheduled acquisition refresh");
		await db.agentTask.update({
			where: { id: task.id },
			data: { attempts: MAX_ATTEMPTS },
		});
		await ensureAcquisitionResearchRun({
			id: task.id,
			contactId: null,
			companyId,
			organizationId: WORKSPACE_ID,
			kind: "acquisition-refresh",
			reason: "Scheduled acquisition refresh",
			budget: 12,
			attempts: MAX_ATTEMPTS,
			priority: 300,
			dueAt: new Date(Date.now() - 1000),
		});

		await retireExhausted();

		const run = await db.acquisitionResearchRun.findUniqueOrThrow({
			where: { agentTaskId: task.id },
		});
		expect(run.status).toBe(AcquisitionResearchRunStatus.FAILED);
	});

	it("preserves independent snapshots across two successful refreshes", async () => {
		const firstTask = await queueRefresh("First refresh");
		await db.agentTask.update({
			where: { id: firstTask.id },
			data: { sessionId: `${sessionId}-1`, finishedAt: new Date() },
		});
		await ensureAcquisitionResearchRun({
			id: firstTask.id,
			contactId: null,
			companyId,
			organizationId: WORKSPACE_ID,
			kind: "acquisition-refresh",
			reason: "First refresh",
			budget: 12,
			attempts: 1,
			priority: 300,
			dueAt: new Date(Date.now() - 1000),
		});
		await succeedAcquisitionResearchRun({
			sessionId: `${sessionId}-1`,
			companyId,
			snapshot: {
				...dossierInput,
				fit: AcquisitionFit.STRONG,
				summary: "First successful snapshot",
				sourceUrls: ["https://first.example.test"],
				researchedAt: new Date("2026-07-01T12:00:00.000Z").toISOString(),
				sourceSessionId: `${sessionId}-1`,
			},
		});

		const secondTask = await queueRefresh("Second refresh");
		await db.agentTask.update({
			where: { id: secondTask.id },
			data: { sessionId: `${sessionId}-2` },
		});
		await ensureAcquisitionResearchRun({
			id: secondTask.id,
			contactId: null,
			companyId,
			organizationId: WORKSPACE_ID,
			kind: "acquisition-refresh",
			reason: "Second refresh",
			budget: 12,
			attempts: 1,
			priority: 300,
			dueAt: new Date(Date.now() - 1000),
		});
		await succeedAcquisitionResearchRun({
			sessionId: `${sessionId}-2`,
			companyId,
			snapshot: {
				...dossierInput,
				fit: AcquisitionFit.POTENTIAL,
				summary: "Second successful snapshot",
				sourceUrls: ["https://second.example.test"],
				researchedAt: new Date("2026-08-01T12:00:00.000Z").toISOString(),
				sourceSessionId: `${sessionId}-2`,
			},
		});

		const runs = await db.acquisitionResearchRun.findMany({
			where: { companyId },
			orderBy: { startedAt: "desc" },
		});
		expect(runs).toHaveLength(2);
		expect(runs[0]?.dossierSnapshot).toMatchObject({
			summary: "Second successful snapshot",
		});
		expect(runs[1]?.dossierSnapshot).toMatchObject({
			summary: "First successful snapshot",
		});
	});

	it("keeps a run running when research pauses for a rep answer", async () => {
		const task = await queueRefresh(
			`Acquisition analysis requested by a rep (${userId})`,
		);
		await ensureAcquisitionResearchRun({
			id: task.id,
			contactId: null,
			companyId,
			organizationId: WORKSPACE_ID,
			kind: "acquisition-refresh",
			reason: task.reason,
			budget: 12,
			attempts: 1,
			priority: 300,
			dueAt: new Date(Date.now() - 1000),
		});

		await completeTask(
			task.id,
			"Research paused because it needs a rep's answer.",
			undefined,
			{ skipResearchRunFinalization: true },
		);

		const run = await db.acquisitionResearchRun.findUniqueOrThrow({
			where: { agentTaskId: task.id },
		});
		expect(run.status).toBe(AcquisitionResearchRunStatus.RUNNING);
		expect(run.finishedAt).toBeNull();
	});

	it("does not mark a run failed on retryable intermediate failures", async () => {
		const task = await queueRefresh("Scheduled acquisition refresh");
		await db.agentTask.update({
			where: { id: task.id },
			data: { attempts: 1 },
		});
		await ensureAcquisitionResearchRun({
			id: task.id,
			contactId: null,
			companyId,
			organizationId: WORKSPACE_ID,
			kind: "acquisition-refresh",
			reason: "Scheduled acquisition refresh",
			budget: 12,
			attempts: 1,
			priority: 300,
			dueAt: new Date(Date.now() - 1000),
		});

		const result = await failTask(task.id, "provider timeout");
		expect(result?.retrying).toBe(true);

		const run = await db.acquisitionResearchRun.findUniqueOrThrow({
			where: { agentTaskId: task.id },
		});
		expect(run.status).toBe(AcquisitionResearchRunStatus.RUNNING);
		expect(run.finishedAt).toBeNull();
	});
});
