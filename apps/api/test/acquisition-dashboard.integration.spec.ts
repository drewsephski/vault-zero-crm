import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	AcquisitionFit,
	AcquisitionStage,
	db,
	EnrichmentStatus,
	WorkspaceMode,
	type WorkspaceMode as WorkspaceModeType,
} from "@crm/db";
import { ACQUISITION_TASK_KINDS } from "@crm/db/acquisition";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { companyListInput } from "../src/companies/companies.contracts";
import { CompaniesService } from "../src/companies/companies.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const viewerId = `acquisition-dashboard-viewer-${suffix}`;
const otherUserId = `acquisition-dashboard-other-${suffix}`;
const fixtureDomain = (name: string) => `${name}-${suffix}.test`;
const companyIds: string[] = [];

const companies = new CompaniesService(
	db,
	new AgentTriggerService(db),
	new AgentQueueService(db),
	{ backfill: async () => null } as never,
	{} as never,
	{} as never,
);
const dashboard = new DashboardService(db, new ConversionService(db));

let previousProfile: {
	mode: WorkspaceModeType;
	preferredIndustries: string[];
	geographies: string[];
	excludedCategories: string[];
} | null = null;
let baselineAcquisitionWork = 0;

async function createCompany(
	name: string,
	ownerId: string,
	target?: {
		stage: AcquisitionStage;
		fit?: AcquisitionFit;
		researchedAt?: Date | null;
	},
	company?: { enrichmentStatus: EnrichmentStatus },
) {
	const created = await db.company.create({
		data: {
			name,
			domain: fixtureDomain(name.toLowerCase().replaceAll(" ", "-")),
			ownerId,
			enrichmentStatus: company?.enrichmentStatus,
			acquisitionTarget: target
				? {
						create: {
							stage: target.stage,
							fit: target.fit ?? AcquisitionFit.UNKNOWN,
							strengths: [],
							concerns: [],
							missingInformation: [],
							sourceUrls: [],
							researchedAt: target.researchedAt,
						},
					}
				: undefined,
		},
		select: { id: true },
	});
	companyIds.push(created.id);
	return created.id;
}

const ids = {
	generic: "",
	active: "",
	rejected: "",
	acquired: "",
	otherActive: "",
	needsResearch: "",
};

beforeAll(async () => {
	previousProfile = await db.acquisitionProfile.findUnique({
		where: { id: WORKSPACE_ID },
		select: {
			mode: true,
			preferredIndustries: true,
			geographies: true,
			excludedCategories: true,
		},
	});
	await db.acquisitionProfile.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			mode: WorkspaceMode.ACQUISITION,
			preferredIndustries: ["Services"],
			geographies: [],
			excludedCategories: [],
			currency: "USD",
		},
		update: {
			mode: WorkspaceMode.ACQUISITION,
			preferredIndustries: ["Services"],
			geographies: [],
			excludedCategories: [],
		},
	});

	await db.user.createMany({
		data: [
			{
				id: viewerId,
				name: "Acquisition Dashboard Viewer",
				email: `viewer@${fixtureDomain("users")}`,
				emailVerified: true,
			},
			{
				id: otherUserId,
				name: "Other Acquisition Owner",
				email: `other@${fixtureDomain("users")}`,
				emailVerified: true,
			},
		],
	});

	ids.generic = await createCompany("Generic Company", viewerId);
	ids.active = await createCompany("Active Target", viewerId, {
		stage: AcquisitionStage.QUALIFIED,
		fit: AcquisitionFit.STRONG,
		researchedAt: new Date(),
	});
	ids.rejected = await createCompany("Rejected Target", viewerId, {
		stage: AcquisitionStage.REJECTED,
		fit: AcquisitionFit.STRONG,
		researchedAt: new Date(),
	});
	ids.acquired = await createCompany("Acquired Target", viewerId, {
		stage: AcquisitionStage.ACQUIRED,
		researchedAt: new Date(),
	});
	ids.otherActive = await createCompany("Other Active Target", otherUserId, {
		stage: AcquisitionStage.WATCHLIST,
		researchedAt: new Date(),
	});
	ids.needsResearch = await createCompany(
		"Needs Research Target",
		viewerId,
		{ stage: AcquisitionStage.RESEARCHING, researchedAt: null },
		{ enrichmentStatus: EnrichmentStatus.COMPLETE },
	);

	baselineAcquisitionWork = await db.agentTask.count({
		where: {
			kind: { in: [...ACQUISITION_TASK_KINDS] },
			finishedAt: null,
		},
	});
	await db.agentTask.createMany({
		data: [
			{
				companyId: ids.active,
				kind: "acquisition-refresh",
				reason: "Integration fixture",
				dueAt: new Date(),
			},
			{
				companyId: ids.active,
				kind: "company-details",
				reason: "Integration fixture",
				dueAt: new Date(),
			},
		],
	});
});

afterAll(async () => {
	await db.agentTask.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.user.deleteMany({ where: { id: { in: [viewerId, otherUserId] } } });
	if (previousProfile) {
		await db.acquisitionProfile.update({
			where: { id: WORKSPACE_ID },
			data: previousProfile,
		});
	} else {
		await db.acquisitionProfile.delete({ where: { id: WORKSPACE_ID } });
	}
});

describe("acquisition target query semantics", () => {
	it("lists active targets by default and exposes explicit historical views", async () => {
		const active = await companies.list(
			companyListInput.parse({ owner: viewerId }),
		);
		expect(active.rows.map((row) => row.id).sort()).toEqual(
			[ids.active, ids.needsResearch].sort(),
		);
		expect(active.total).toBe(2);
		expect(active.facetCounts.owner).toMatchObject({
			[viewerId]: 2,
			[otherUserId]: 1,
		});

		const rejected = await companies.list(
			companyListInput.parse({ owner: viewerId, targetView: "rejected" }),
		);
		expect(rejected.rows.map((row) => row.id)).toEqual([ids.rejected]);

		const acquired = await companies.list(
			companyListInput.parse({ owner: viewerId, targetView: "acquired" }),
		);
		expect(acquired.rows.map((row) => row.id)).toEqual([ids.acquired]);

		const history = await companies.list(
			companyListInput.parse({ owner: viewerId, targetView: "history" }),
		);
		expect(history.rows.map((row) => row.id).sort()).toEqual(
			[ids.active, ids.rejected, ids.acquired, ids.needsResearch].sort(),
		);
	});

	it("ignores target views in sales mode", async () => {
		await db.acquisitionProfile.update({
			where: { id: WORKSPACE_ID },
			data: { mode: WorkspaceMode.SALES },
		});

		try {
			const result = await companies.list(
				companyListInput.parse({ owner: viewerId, targetView: "rejected" }),
			);
			expect(result.rows.map((row) => row.id).sort()).toEqual(
				[
					ids.generic,
					ids.active,
					ids.rejected,
					ids.acquired,
					ids.needsResearch,
				].sort(),
			);
		} finally {
			await db.acquisitionProfile.update({
				where: { id: WORKSPACE_ID },
				data: { mode: WorkspaceMode.ACQUISITION },
			});
		}
	});

	it("derives scoped dashboard metrics from active target rows", async () => {
		const summary = await dashboard.summary(viewerId, { scope: "me" });
		expect(summary.mode).toBe("ACQUISITION");
		expect(summary.acquisition).toMatchObject({
			totalTargets: 2,
			visibleMatches: 1,
			needsResearch: 1,
			activeAgentWork: baselineAcquisitionWork + 1,
		});
		expect(
			summary.acquisition?.priorityTargets.map((target) => target.company.id),
		).toEqual([ids.active]);
	});
});
