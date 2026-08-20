import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import {
	AcquisitionEngagementStage,
	AcquisitionEngagementStatus,
	AcquisitionStage,
	db,
	WorkspaceMode,
} from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { acquireCanonicalWorkspaceFixture } from "../../../packages/db/test/canonical-workspace-fixture";
import { AcquisitionService } from "../src/acquisition/acquisition.service";
import type { CreateAcquisitionEngagementInput } from "../src/acquisition/acquisition-engagements.contracts";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";

const domains: string[] = [];
const companyIds: string[] = [];
let originalFocus: {
	mode: WorkspaceMode;
	preferredIndustries: string[];
	geographies: string[];
} | null;
let releaseCanonicalWorkspace: (() => Promise<void>) | undefined;

beforeAll(async () => {
	releaseCanonicalWorkspace = await acquireCanonicalWorkspaceFixture();
	originalFocus = await db.acquisitionProfile.findUnique({
		where: { id: WORKSPACE_ID },
		select: {
			mode: true,
			preferredIndustries: true,
			geographies: true,
		},
	});
}, 120_000);

beforeEach(async () => {
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
});

afterEach(async () => {
	const companies = await db.company.findMany({
		where: {
			OR: [{ id: { in: companyIds } }, { domain: { in: domains } }],
		},
		select: { id: true },
	});
	await db.activity.deleteMany({
		where: { companyId: { in: companies.map((company) => company.id) } },
	});
	await db.company.deleteMany({
		where: { id: { in: companies.map((company) => company.id) } },
	});
	domains.length = 0;
	companyIds.length = 0;
});

afterAll(async () => {
	try {
		if (originalFocus) {
			await db.acquisitionProfile.update({
				where: { id: WORKSPACE_ID },
				data: originalFocus,
			});
		} else {
			await db.acquisitionProfile.deleteMany({ where: { id: WORKSPACE_ID } });
		}
	} finally {
		await releaseCanonicalWorkspace?.();
	}
});

function companyService() {
	return new CompaniesService(
		db,
		new AgentTriggerService(db),
		new AgentQueueService(db),
		{ backfill: async () => null } as never,
		{} as never,
		{ reportingCurrency: async () => "USD" } as never,
	);
}

function service() {
	return new AcquisitionService(
		db,
		companyService(),
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

async function ensureWorkspaceMember(
	userId: string,
	email: string,
	name: string,
) {
	await db.user.upsert({
		where: { id: userId },
		create: { id: userId, name, email, emailVerified: true },
		update: {},
	});
	await db.member.upsert({
		where: {
			organizationId_userId: {
				organizationId: WORKSPACE_ID,
				userId,
			},
		},
		create: {
			id: `member-${userId}`,
			organizationId: WORKSPACE_ID,
			userId,
			createdAt: new Date(),
		},
		update: {},
	});
}

async function createTargetCompany(
	name: string,
	domain: string,
	ownerId?: string | null,
) {
	const company = await db.company.create({
		data: {
			name,
			domain,
			ownerId: ownerId ?? undefined,
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
	});
	domains.push(domain);
	companyIds.push(company.id);
	return company;
}

async function createEngagement(
	companyId: string,
	actingUserId: string,
	options?: {
		ownerId?: string;
		stage?: CreateAcquisitionEngagementInput["stage"];
	},
) {
	return service().createEngagement(
		{
			companyId,
			idempotencyKey: crypto.randomUUID(),
			ownerId: options?.ownerId,
			stage: options?.stage,
		},
		actingUserId,
	);
}

describe("acquisition engagement list read model", () => {
	it("scopes rows to the current workspace", async () => {
		const suffix = crypto.randomUUID();
		const actingUserId = `list-acting-${suffix}`;
		await ensureWorkspaceMember(
			actingUserId,
			`list-acting-${suffix}@example.com`,
			"List Acting User",
		);
		const isolatedOrgId = crypto.randomUUID();
		const isolatedDomain = `isolated-list-${suffix}.test`;
		let isolatedCompanyId = "";

		await db.organization.create({
			data: {
				id: isolatedOrgId,
				name: "Isolated Engagement List Org",
				slug: `iso-eng-list-${suffix}`,
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
						name: "Isolated List Target",
						domain: isolatedDomain,
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
				isolatedCompanyId = created.id;
				await service().createEngagement(
					{
						companyId: created.id,
						idempotencyKey: crypto.randomUUID(),
					},
					actingUserId,
				);
			});

			const localCompany = await createTargetCompany(
				"Workspace Scoped Target",
				`workspace-scoped-${suffix}.test`,
			);
			const localEngagement = await createEngagement(
				localCompany.id,
				actingUserId,
			);

			const listed = await service().listEngagements({ status: "all" });

			expect(listed.rows.some((row) => row.id === localEngagement.id)).toBe(
				true,
			);
			expect(
				listed.rows.some((row) => row.companyId === isolatedCompanyId),
			).toBe(false);
			expect(listed.total).toBeGreaterThanOrEqual(1);
		} finally {
			await db.company.deleteMany({ where: { domain: isolatedDomain } });
			await db.acquisitionProfile.delete({ where: { id: isolatedOrgId } });
			await db.organization.delete({ where: { id: isolatedOrgId } });
		}
	});

	it("searches by target name and paginates deterministically", async () => {
		const suffix = crypto.randomUUID();
		const tag = `EngList-${suffix}`;
		const actingUserId = `search-acting-${suffix}`;
		await ensureWorkspaceMember(
			actingUserId,
			`search-acting-${suffix}@example.com`,
			"Search Acting User",
		);

		const alpha = await createTargetCompany(
			`${tag} Alpha Mechanical`,
			`alpha-mechanical-${suffix}.test`,
		);
		const beta = await createTargetCompany(
			`${tag} Beta Plumbing`,
			`beta-plumbing-${suffix}.test`,
		);
		const gamma = await createTargetCompany(
			`${tag} Gamma HVAC`,
			`gamma-hvac-${suffix}.test`,
		);

		const alphaEngagement = await createEngagement(alpha.id, actingUserId);
		const betaEngagement = await createEngagement(beta.id, actingUserId);
		const gammaEngagement = await createEngagement(gamma.id, actingUserId);

		await db.acquisitionEngagement.update({
			where: { id: alphaEngagement.id },
			data: { stageChangedAt: new Date("2026-01-03T12:00:00.000Z") },
		});
		await db.acquisitionEngagement.update({
			where: { id: betaEngagement.id },
			data: { stageChangedAt: new Date("2026-01-02T12:00:00.000Z") },
		});
		await db.acquisitionEngagement.update({
			where: { id: gammaEngagement.id },
			data: { stageChangedAt: new Date("2026-01-01T12:00:00.000Z") },
		});

		const searched = await service().listEngagements({
			q: "plumbing",
			status: "all",
		});
		expect(searched.rows.map((row) => row.id)).toEqual([betaEngagement.id]);
		expect(searched.total).toBe(1);

		const pageOne = await service().listEngagements({
			q: tag,
			status: "all",
			page: 1,
			pageSize: 2,
		});
		expect(pageOne.rows.map((row) => row.id)).toEqual([
			alphaEngagement.id,
			betaEngagement.id,
		]);
		expect(pageOne.total).toBe(3);

		const pageTwo = await service().listEngagements({
			q: tag,
			status: "all",
			page: 2,
			pageSize: 2,
		});
		expect(pageTwo.rows.map((row) => row.id)).toEqual([gammaEngagement.id]);
	});

	it("filters by status, stage, and owner facets", async () => {
		const suffix = crypto.randomUUID();
		const tag = `Facet-${suffix}`;
		const ownerA = `owner-a-${suffix}`;
		const ownerB = `owner-b-${suffix}`;
		const actingUserId = `facet-acting-${suffix}`;
		await ensureWorkspaceMember(
			ownerA,
			`owner-a-${suffix}@example.com`,
			"Owner A",
		);
		await ensureWorkspaceMember(
			ownerB,
			`owner-b-${suffix}@example.com`,
			"Owner B",
		);
		await ensureWorkspaceMember(
			actingUserId,
			`facet-acting-${suffix}@example.com`,
			"Facet Acting User",
		);

		const outreachCompany = await createTargetCompany(
			`${tag} Outreach Target`,
			`facet-outreach-${suffix}.test`,
		);
		const engagedCompany = await createTargetCompany(
			`${tag} Engaged Target`,
			`facet-engaged-${suffix}.test`,
		);
		const passedCompany = await createTargetCompany(
			`${tag} Passed Target`,
			`facet-passed-${suffix}.test`,
		);

		const outreach = await createEngagement(outreachCompany.id, actingUserId, {
			ownerId: ownerA,
			stage: AcquisitionEngagementStage.OUTREACH,
		});
		const engaged = await createEngagement(engagedCompany.id, actingUserId, {
			ownerId: ownerB,
			stage: AcquisitionEngagementStage.ENGAGED,
		});
		const passed = await createEngagement(passedCompany.id, actingUserId, {
			ownerId: ownerA,
		});
		await service().updateEngagementStage(
			{
				engagementId: passed.id,
				stage: AcquisitionEngagementStage.PASSED,
				closedReason: "Not a fit for this pursuit.",
			},
			actingUserId,
		);

		const active = await service().listEngagements({
			q: tag,
			status: "active",
		});
		expect(active.rows.map((row) => row.id).sort()).toEqual(
			[outreach.id, engaged.id].sort(),
		);
		expect(active.total).toBe(2);
		expect(active.facetCounts.status).toEqual({
			active: 2,
			terminal: 1,
		});

		const terminal = await service().listEngagements({
			q: tag,
			status: "terminal",
		});
		expect(terminal.rows.map((row) => row.id)).toEqual([passed.id]);
		expect(terminal.total).toBe(1);
		expect(terminal.rows.every((row) => row.status === "TERMINAL")).toBe(true);

		const byStage = await service().listEngagements({
			q: tag,
			status: "all",
			stage: AcquisitionEngagementStage.ENGAGED,
		});
		expect(byStage.rows.map((row) => row.id)).toEqual([engaged.id]);
		expect(byStage.facetCounts.stage.ENGAGED).toBe(1);

		const byOwner = await service().listEngagements({
			q: tag,
			status: "all",
			owner: ownerA,
		});
		expect(byOwner.rows.map((row) => row.id).sort()).toEqual(
			[outreach.id, passed.id].sort(),
		);
		expect(byOwner.facetCounts.owner).toMatchObject({
			[ownerA]: 2,
			[ownerB]: 1,
		});
	});

	it("sorts by expectedCloseDate, amount, and stageChangedAt", async () => {
		const suffix = crypto.randomUUID();
		const tag = `Sort-${suffix}`;
		const actingUserId = `sort-acting-${suffix}`;
		await ensureWorkspaceMember(
			actingUserId,
			`sort-acting-${suffix}@example.com`,
			"Sort Acting User",
		);

		const earlyCompany = await createTargetCompany(
			`${tag} Early Target`,
			`sort-early-${suffix}.test`,
		);
		const middleCompany = await createTargetCompany(
			`${tag} Middle Target`,
			`sort-middle-${suffix}.test`,
		);
		const lateCompany = await createTargetCompany(
			`${tag} Late Target`,
			`sort-late-${suffix}.test`,
		);

		const early = await createEngagement(earlyCompany.id, actingUserId);
		const middle = await createEngagement(middleCompany.id, actingUserId);
		const late = await createEngagement(lateCompany.id, actingUserId);

		await db.acquisitionEngagement.update({
			where: { id: early.id },
			data: {
				expectedCloseDate: new Date("2026-03-01T00:00:00.000Z"),
				baseAmount: 1_000_000,
				stageChangedAt: new Date("2026-02-01T12:00:00.000Z"),
			},
		});
		await db.acquisitionEngagement.update({
			where: { id: middle.id },
			data: {
				expectedCloseDate: new Date("2026-06-01T00:00:00.000Z"),
				baseAmount: 2_000_000,
				stageChangedAt: new Date("2026-02-02T12:00:00.000Z"),
			},
		});
		await db.acquisitionEngagement.update({
			where: { id: late.id },
			data: {
				expectedCloseDate: new Date("2026-09-01T00:00:00.000Z"),
				baseAmount: 3_000_000,
				stageChangedAt: new Date("2026-02-03T12:00:00.000Z"),
			},
		});

		const listInput = { q: tag, status: "all" as const, pageSize: 100 };

		const byCloseAsc = await service().listEngagements({
			...listInput,
			sort: "expectedCloseDate",
			dir: "asc",
		});
		expect(byCloseAsc.rows.map((row) => row.id)).toEqual([
			early.id,
			middle.id,
			late.id,
		]);

		const byCloseDesc = await service().listEngagements({
			...listInput,
			sort: "expectedCloseDate",
			dir: "desc",
		});
		expect(byCloseDesc.rows.map((row) => row.id)).toEqual([
			late.id,
			middle.id,
			early.id,
		]);

		const byAmountAsc = await service().listEngagements({
			...listInput,
			sort: "amount",
			dir: "asc",
		});
		expect(byAmountAsc.rows.map((row) => row.id)).toEqual([
			early.id,
			middle.id,
			late.id,
		]);

		const byAmountDesc = await service().listEngagements({
			...listInput,
			sort: "amount",
			dir: "desc",
		});
		expect(byAmountDesc.rows.map((row) => row.id)).toEqual([
			late.id,
			middle.id,
			early.id,
		]);

		const byStageChangedAsc = await service().listEngagements({
			...listInput,
			sort: "stageChangedAt",
			dir: "asc",
		});
		expect(byStageChangedAsc.rows.map((row) => row.id)).toEqual([
			early.id,
			middle.id,
			late.id,
		]);

		const byStageChangedDesc = await service().listEngagements({
			...listInput,
			sort: "stageChangedAt",
			dir: "desc",
		});
		expect(byStageChangedDesc.rows.map((row) => row.id)).toEqual([
			late.id,
			middle.id,
			early.id,
		]);
	});

	it("lists engagementTargetOptions for targets without active engagements", async () => {
		const suffix = crypto.randomUUID();
		const actingUserId = `options-acting-${suffix}`;
		await ensureWorkspaceMember(
			actingUserId,
			`options-acting-${suffix}@example.com`,
			"Options Acting User",
		);

		const openTarget = await createTargetCompany(
			"Open Opportunity Target",
			`open-opportunity-${suffix}.test`,
		);
		const activeTarget = await createTargetCompany(
			"Active Opportunity Target",
			`active-opportunity-${suffix}.test`,
		);
		const closedTarget = await createTargetCompany(
			"Closed Opportunity Target",
			`closed-opportunity-${suffix}.test`,
		);
		const noTargetCompany = await db.company.create({
			data: {
				name: "No Target Company",
				domain: `no-target-${suffix}.test`,
			},
		});
		domains.push(noTargetCompany.domain ?? `no-target-${suffix}.test`);
		companyIds.push(noTargetCompany.id);

		const activeEngagement = await createEngagement(
			activeTarget.id,
			actingUserId,
		);
		const closedEngagement = await createEngagement(
			closedTarget.id,
			actingUserId,
		);
		await service().updateEngagementStage(
			{
				engagementId: closedEngagement.id,
				stage: AcquisitionEngagementStage.PASSED,
				closedReason: "Closed before checking available targets.",
			},
			actingUserId,
		);

		const options = await service().engagementTargetOptions({ q: "" });
		const optionIds = options.map((option) => option.id);

		expect(optionIds).toContain(openTarget.id);
		expect(optionIds).toContain(closedTarget.id);
		expect(optionIds).not.toContain(activeTarget.id);
		expect(optionIds).not.toContain(noTargetCompany.id);

		const searched = await service().engagementTargetOptions({
			q: "open opportunity",
		});
		expect(searched.map((option) => option.id)).toEqual([openTarget.id]);

		expect(
			await db.acquisitionEngagement.findUnique({
				where: { id: activeEngagement.id },
				select: { status: true },
			}),
		).toMatchObject({ status: AcquisitionEngagementStatus.ACTIVE });
	});
});
