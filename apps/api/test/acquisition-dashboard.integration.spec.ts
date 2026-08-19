import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	AcquisitionCandidateStatus,
	AcquisitionEngagementStage,
	AcquisitionEngagementStatus,
	AcquisitionFit,
	AcquisitionStage,
	ActivityType,
	db,
	EnrichmentStatus,
	WorkspaceMode,
	type WorkspaceMode as WorkspaceModeType,
} from "@crm/db";
import { ACQUISITION_TASK_KINDS } from "@crm/db/acquisition";
import { runInOrganization } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { acquireCanonicalWorkspaceFixture } from "../../../packages/db/test/canonical-workspace-fixture";
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
let activeContactId = "";
let releaseCanonicalWorkspace: (() => Promise<void>) | undefined;

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

const engagementIds = {
	active: "",
};

const ids = {
	generic: "",
	active: "",
	rejected: "",
	acquired: "",
	otherActive: "",
	needsResearch: "",
};
const dealIds = {
	active: "",
	generic: "",
	rejected: "",
	acquired: "",
};

const activeTaskSubjects = [
	"Active company task",
	"Active contact task",
	"Active deal task",
];

beforeAll(async () => {
	releaseCanonicalWorkspace = await acquireCanonicalWorkspaceFixture();
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

	await runInOrganization(WORKSPACE_ID, async () => {
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
			{ stage: AcquisitionStage.DISCOVERED, researchedAt: null },
			{ enrichmentStatus: EnrichmentStatus.COMPLETE },
		);

		const activeEngagement = await db.acquisitionEngagement.create({
			data: {
				organizationId: WORKSPACE_ID,
				companyId: ids.active,
				ownerId: viewerId,
				stage: AcquisitionEngagementStage.OUTREACH,
				status: AcquisitionEngagementStatus.ACTIVE,
			},
			select: { id: true },
		});
		engagementIds.active = activeEngagement.id;

		const activeContact = await db.contact.create({
			data: {
				firstName: "Active Target Contact",
				companyId: ids.active,
			},
			select: { id: true },
		});
		activeContactId = activeContact.id;
		const [activeDeal, genericDeal, rejectedDeal, acquiredDeal] =
			await Promise.all([
				db.deal.create({
					data: {
						name: "Active target opportunity",
						companyId: ids.active,
						ownerId: viewerId,
					},
					select: { id: true },
				}),
				db.deal.create({
					data: {
						name: "Generic company opportunity",
						companyId: ids.generic,
						ownerId: viewerId,
					},
					select: { id: true },
				}),
				db.deal.create({
					data: {
						name: "Rejected target opportunity",
						companyId: ids.rejected,
						ownerId: viewerId,
					},
					select: { id: true },
				}),
				db.deal.create({
					data: {
						name: "Acquired target opportunity",
						companyId: ids.acquired,
						ownerId: viewerId,
					},
					select: { id: true },
				}),
			]);
		dealIds.active = activeDeal.id;
		dealIds.generic = genericDeal.id;
		dealIds.rejected = rejectedDeal.id;
		dealIds.acquired = acquiredDeal.id;

		await db.activity.createMany({
			data: [
				{
					type: ActivityType.TASK,
					subject: activeTaskSubjects[0],
					companyId: ids.needsResearch,
					createdById: viewerId,
				},
				{
					type: ActivityType.TASK,
					subject: activeTaskSubjects[1],
					contactId: activeContact.id,
					createdById: viewerId,
				},
				{
					type: ActivityType.TASK,
					subject: activeTaskSubjects[2],
					dealId: activeDeal.id,
					createdById: viewerId,
				},
				{
					type: ActivityType.TASK,
					subject: "Generic company task",
					companyId: ids.generic,
					createdById: viewerId,
				},
				{
					type: ActivityType.TASK,
					subject: "Rejected target deal task",
					dealId: rejectedDeal.id,
					createdById: viewerId,
				},
				{
					type: ActivityType.TASK,
					subject: "Acquired target deal task",
					dealId: acquiredDeal.id,
					createdById: viewerId,
				},
				{
					type: ActivityType.TASK,
					subject: "Recordless task",
					createdById: viewerId,
				},
			],
		});

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
}, 120_000);

afterAll(async () => {
	try {
		await db.agentTask.deleteMany({
			where: { companyId: { in: companyIds } },
		});
		await db.activity.deleteMany({ where: { createdById: viewerId } });
		await db.contact.deleteMany({ where: { id: activeContactId } });
		await db.company.deleteMany({ where: { id: { in: companyIds } } });
		await db.user.deleteMany({
			where: { id: { in: [viewerId, otherUserId] } },
		});
		if (previousProfile) {
			await db.acquisitionProfile.update({
				where: { id: WORKSPACE_ID },
				data: previousProfile,
			});
		} else {
			await db.acquisitionProfile.delete({ where: { id: WORKSPACE_ID } });
		}
	} finally {
		await releaseCanonicalWorkspace?.();
	}
});

describe("acquisition target query semantics", () => {
	it("lists active targets by default and exposes explicit historical views", async () => {
		const active = await runInOrganization(WORKSPACE_ID, () =>
			companies.list(companyListInput.parse({ owner: viewerId })),
		);
		expect(active.rows.map((row) => row.id).sort()).toEqual(
			[ids.active, ids.needsResearch].sort(),
		);
		expect(active.total).toBe(2);
		expect(active.facetCounts.owner).toMatchObject({
			[viewerId]: 2,
			[otherUserId]: 1,
		});

		const rejected = await runInOrganization(WORKSPACE_ID, () =>
			companies.list(
				companyListInput.parse({ owner: viewerId, targetView: "rejected" }),
			),
		);
		expect(rejected.rows.map((row) => row.id)).toEqual([ids.rejected]);

		const acquired = await runInOrganization(WORKSPACE_ID, () =>
			companies.list(
				companyListInput.parse({ owner: viewerId, targetView: "acquired" }),
			),
		);
		expect(acquired.rows.map((row) => row.id)).toEqual([ids.acquired]);

		const history = await runInOrganization(WORKSPACE_ID, () =>
			companies.list(
				companyListInput.parse({ owner: viewerId, targetView: "history" }),
			),
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
			const result = await runInOrganization(WORKSPACE_ID, () =>
				companies.list(
					companyListInput.parse({ owner: viewerId, targetView: "rejected" }),
				),
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
		const summary = await runInOrganization(WORKSPACE_ID, () =>
			dashboard.summary(viewerId, { scope: "me" }),
		);
		expect(summary.mode).toBe("ACQUISITION");
		expect(summary.acquisition).toMatchObject({
			totalTargets: 2,
			visibleMatches: 1,
			needsResearch: 1,
			activeAgentWork: baselineAcquisitionWork + 1,
			activeAcquisitions: 1,
			missingNextActions: 0,
			nextActionCount: 3,
		});
		expect(
			summary.acquisition?.priorityTargets.map((target) => target.company.id),
		).toEqual([ids.active]);
		expect(
			summary.acquisition?.activeOpportunities.map(
				(opportunity) => opportunity.id,
			),
		).toEqual([engagementIds.active]);
		expect(
			summary.acquisition?.nextActions.map((task) => task.subject).sort(),
		).toEqual(activeTaskSubjects.toSorted());
	});

	it("does not count acquisition targets from another workspace", async () => {
		const isolatedOrgId = crypto.randomUUID();
		const isolatedDomain = fixtureDomain("isolated-org-target");
		let isolatedCompanyId = "";

		await db.organization.create({
			data: {
				id: isolatedOrgId,
				name: "Isolated Acquisition Org",
				slug: `iso-acq-${suffix}`,
				createdAt: new Date(),
			},
		});
		await db.acquisitionProfile.create({
			data: {
				id: isolatedOrgId,
				mode: WorkspaceMode.ACQUISITION,
				preferredIndustries: ["Services"],
				geographies: [],
				excludedCategories: [],
				currency: "USD",
			},
		});

		try {
			await runInOrganization(isolatedOrgId, async () => {
				const created = await db.company.create({
					data: {
						name: "Isolated Org Target",
						domain: isolatedDomain,
						ownerId: viewerId,
						acquisitionTarget: {
							create: {
								stage: AcquisitionStage.QUALIFIED,
								fit: AcquisitionFit.STRONG,
								strengths: [],
								concerns: [],
								missingInformation: [],
								sourceUrls: [],
								researchedAt: new Date(),
							},
						},
					},
					select: { id: true },
				});
				isolatedCompanyId = created.id;
			});

			const summary = await runInOrganization(WORKSPACE_ID, () =>
				dashboard.summary(viewerId, { scope: "me" }),
			);

			expect(summary.acquisition?.totalTargets).toBe(2);
			expect(
				summary.acquisition?.priorityTargets.some(
					(target) => target.company.id === isolatedCompanyId,
				),
			).toBe(false);
		} finally {
			await db.company.deleteMany({
				where: { domain: isolatedDomain },
			});
			await db.acquisitionProfile.delete({ where: { id: isolatedOrgId } });
			await db.organization.delete({ where: { id: isolatedOrgId } });
		}
	});
});
