import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { AcquisitionFit, AcquisitionStage, db, WorkspaceMode } from "@crm/db";
import { AcquisitionResearchRunStatus } from "@crm/db/enums";
import { runInOrganization } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { AcquisitionService } from "../src/acquisition/acquisition.service";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";

const domains: string[] = [];
const companyIds: string[] = [];
const otherOrganizationId = `other-org-${crypto.randomUUID()}`;

beforeAll(async () => {
	await db.acquisitionProfile.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			mode: WorkspaceMode.ACQUISITION,
			preferredIndustries: ["Industrial services"],
			geographies: [],
			excludedCategories: [],
		},
		update: {
			mode: WorkspaceMode.ACQUISITION,
			preferredIndustries: ["Industrial services"],
			geographies: [],
		},
	});
	await db.organization.upsert({
		where: { id: otherOrganizationId },
		create: {
			id: otherOrganizationId,
			name: "Other workspace",
			slug: otherOrganizationId,
			createdAt: new Date(),
		},
		update: {},
	});
}, 120_000);

afterEach(async () => {
	const companies = await db.company.findMany({
		where: {
			OR: [{ id: { in: companyIds } }, { domain: { in: domains } }],
		},
		select: { id: true },
	});
	const ids = companies.map((company) => company.id);
	await db.acquisitionResearchRun.deleteMany({
		where: { companyId: { in: ids } },
	});
	await db.acquisitionTarget.deleteMany({ where: { companyId: { in: ids } } });
	await db.company.deleteMany({ where: { id: { in: ids } } });
	domains.length = 0;
	companyIds.length = 0;
});

afterAll(async () => {
	await db.organization.deleteMany({ where: { id: otherOrganizationId } });
});

function service() {
	return new AcquisitionService(
		db,
		new CompaniesService(
			db,
			new AgentTriggerService(db),
			new AgentQueueService(db),
			{ backfill: async () => null } as never,
			{} as never,
			{ reportingCurrency: async () => "USD" } as never,
		),
		new AgentTriggerService(db),
		{
			reportingCurrency: async () => "USD",
			amountFields: async () => ({
				baseAmount: null,
				baseCurrency: null,
				fxRate: null,
				fxRateAt: null,
			}),
		} as never,
	);
}

async function createTarget(domain: string) {
	const company = await db.company.create({
		data: {
			name: `Research history ${domain}`,
			domain,
			acquisitionTarget: {
				create: {
					stage: AcquisitionStage.QUALIFIED,
					strengths: [],
					concerns: [],
					missingInformation: [],
					sourceUrls: [],
				},
			},
		},
		select: { id: true },
	});
	domains.push(domain);
	companyIds.push(company.id);
	return company.id;
}

describe("acquisition research run read API", () => {
	it("lists runs newest first with lightweight snapshot fields", async () => {
		const domain = `research-runs-${crypto.randomUUID()}.test`;
		const companyId = await createTarget(domain);
		const older = await db.acquisitionResearchRun.create({
			data: {
				organizationId: WORKSPACE_ID,
				companyId,
				kind: "acquisition-refresh",
				agentTaskId: `task-older-${crypto.randomUUID()}`,
				status: AcquisitionResearchRunStatus.SUCCEEDED,
				startedAt: new Date("2026-07-01T12:00:00.000Z"),
				finishedAt: new Date("2026-07-01T12:30:00.000Z"),
				dossierSnapshot: {
					fit: AcquisitionFit.STRONG,
					summary: "Older successful snapshot",
					criteria: [],
					strengths: [],
					concerns: [],
					missingInformation: [],
					recommendedAction: "Follow up",
					recommendedStage: null,
					sourceUrls: [],
					researchedAt: "2026-07-01T12:30:00.000Z",
					sourceSessionId: "older-session",
				},
			},
		});
		const newer = await db.acquisitionResearchRun.create({
			data: {
				organizationId: WORKSPACE_ID,
				companyId,
				kind: "acquisition-refresh",
				agentTaskId: `task-newer-${crypto.randomUUID()}`,
				status: AcquisitionResearchRunStatus.FAILED,
				startedAt: new Date("2026-08-01T12:00:00.000Z"),
				finishedAt: new Date("2026-08-01T12:05:00.000Z"),
				outcome: "provider timeout",
			},
		});

		const rows = await runInOrganization(WORKSPACE_ID, () =>
			service().listResearchRuns({ companyId }),
		);

		expect(rows.map((row) => row.id)).toEqual([newer.id, older.id]);
		const limited = await runInOrganization(WORKSPACE_ID, () =>
			service().listResearchRuns({ companyId, limit: 1 }),
		);
		expect(limited.map((row) => row.id)).toEqual([newer.id]);
		expect(rows[0]).toMatchObject({
			status: AcquisitionResearchRunStatus.FAILED,
			outcome: "provider timeout",
			snapshotFit: null,
			snapshotSummary: null,
		});
		expect(rows[1]).toMatchObject({
			status: AcquisitionResearchRunStatus.SUCCEEDED,
			snapshotFit: AcquisitionFit.STRONG,
			snapshotSummary: "Older successful snapshot",
		});
	});

	it("returns the full snapshot through getResearchRun", async () => {
		const domain = `research-run-detail-${crypto.randomUUID()}.test`;
		const companyId = await createTarget(domain);
		const run = await db.acquisitionResearchRun.create({
			data: {
				organizationId: WORKSPACE_ID,
				companyId,
				kind: "acquisition-refresh",
				agentTaskId: `task-detail-${crypto.randomUUID()}`,
				status: AcquisitionResearchRunStatus.SUCCEEDED,
				dossierSnapshot: {
					fit: AcquisitionFit.POTENTIAL,
					summary: "Detailed snapshot body",
					criteria: [],
					strengths: [],
					concerns: [],
					missingInformation: [],
					recommendedAction: "Follow up",
					recommendedStage: null,
					sourceUrls: [],
					researchedAt: "2026-08-01T12:00:00.000Z",
					sourceSessionId: "detail-session",
				},
			},
		});

		const detail = await runInOrganization(WORKSPACE_ID, () =>
			service().getResearchRun({ id: run.id }),
		);

		expect(detail.snapshot).toMatchObject({
			fit: AcquisitionFit.POTENTIAL,
			summary: "Detailed snapshot body",
			sourceSessionId: "detail-session",
		});
	});

	it("keeps malformed historical runs visible with an unavailable snapshot", async () => {
		const domain = `research-run-malformed-${crypto.randomUUID()}.test`;
		const companyId = await createTarget(domain);
		const run = await db.acquisitionResearchRun.create({
			data: {
				organizationId: WORKSPACE_ID,
				companyId,
				kind: "acquisition-refresh",
				agentTaskId: `task-malformed-${crypto.randomUUID()}`,
				status: AcquisitionResearchRunStatus.SUCCEEDED,
				dossierSnapshot: {
					fit: "GOOD",
					summary: "Legacy malformed snapshot",
				},
			},
		});

		const rows = await runInOrganization(WORKSPACE_ID, () =>
			service().listResearchRuns({ companyId }),
		);
		const detail = await runInOrganization(WORKSPACE_ID, () =>
			service().getResearchRun({ id: run.id }),
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: run.id,
			status: AcquisitionResearchRunStatus.SUCCEEDED,
			snapshotFit: null,
			snapshotSummary: null,
		});
		expect(detail.snapshot).toBeNull();
	});

	it("scopes listResearchRuns to the active organization", async () => {
		const domain = `research-runs-tenant-${crypto.randomUUID()}.test`;
		let companyId = "";
		await runInOrganization(otherOrganizationId, async () => {
			companyId = await createTarget(domain);
			await db.acquisitionResearchRun.create({
				data: {
					organizationId: otherOrganizationId,
					companyId,
					kind: "acquisition-refresh",
					agentTaskId: `task-tenant-${crypto.randomUUID()}`,
					status: AcquisitionResearchRunStatus.SUCCEEDED,
				},
			});
		});

		await expect(
			runInOrganization(WORKSPACE_ID, () =>
				service().listResearchRuns({ companyId }),
			),
		).rejects.toThrow("That company no longer exists.");
	});
});
