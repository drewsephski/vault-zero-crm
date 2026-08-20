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
	AcquisitionCandidateStatus,
	AcquisitionEngagementStage,
	AcquisitionEngagementStatus,
	AcquisitionFit,
	AcquisitionStage,
	ActivityType,
	db,
	EnrichmentStatus,
	RecordSource,
	WorkspaceMode,
} from "@crm/db";
import type { AcquisitionCriterionAssessment } from "@crm/db/acquisition";
import { proposeAcquisitionCandidates } from "@crm/db/acquisition-candidates";
import { runInOrganization } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { acquireCanonicalWorkspaceFixture } from "../../../packages/db/test/canonical-workspace-fixture";
import { AcquisitionService } from "../src/acquisition/acquisition.service";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";

const domains: string[] = [];
const companyIds: string[] = [];
const realBridgeSecret = process.env.AGENT_BRIDGE_SECRET;
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
	await db.agentTask.deleteMany({
		where: { companyId: { in: companies.map((company) => company.id) } },
	});
	await db.acquisitionCandidate.deleteMany({
		where: { domain: { in: domains } },
	});
	await db.company.deleteMany({
		where: { id: { in: companies.map((company) => company.id) } },
	});
	domains.length = 0;
	companyIds.length = 0;
	if (realBridgeSecret === undefined) delete process.env.AGENT_BRIDGE_SECRET;
	else process.env.AGENT_BRIDGE_SECRET = realBridgeSecret;
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
	delete process.env.AGENT_BRIDGE_SECRET;
	return new CompaniesService(
		db,
		new AgentTriggerService(db),
		new AgentQueueService(db),
		{ backfill: async () => null } as never,
		{} as never,
		{ reportingCurrency: async () => "USD" } as never,
	);
}

function service(agent = new AgentTriggerService(db)) {
	return new AcquisitionService(db, companyService(), agent, {
		reportingCurrency: async () => "USD",
		amountFields: async () => ({
			baseAmount: null,
			baseCurrency: null,
			fxRate: null,
			fxRateAt: null,
		}),
	} as never);
}

async function createEngagementTargetCompany(
	domain: string,
	ownerId?: string | null,
) {
	const company = await db.company.create({
		data: {
			name: "Engagement Target Company",
			domain,
			ownerId: ownerId ?? undefined,
			acquisitionTarget: {
				create: {
					stage: AcquisitionStage.DISCOVERED,
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

const dossierACriteria: AcquisitionCriterionAssessment[] = [
	{
		id: "industry",
		result: "MATCH",
		explanation: "The company operates in the preferred industry.",
		blocksQualification: false,
		evidence: [
			{
				label: "Company services",
				url: "https://dossier.example.test/services",
			},
		],
	},
	{
		id: "revenue",
		result: "UNKNOWN",
		explanation: "No reliable source states annual company revenue.",
		blocksQualification: true,
		evidence: [],
	},
];

describe("acquisition dossier read model", () => {
	it("reports open acquisition task state without replacing the persisted dossier", async () => {
		const domain = `dossier-state-${crypto.randomUUID()}.test`;
		const timestampA = new Date("2026-08-01T12:00:00.000Z");
		domains.push(domain);
		const company = await db.company.create({
			data: {
				name: "Dossier State Target",
				domain,
				enrichmentStatus: EnrichmentStatus.COMPLETE,
				acquisitionTarget: {
					create: {
						fit: AcquisitionFit.POTENTIAL,
						summary: "Dossier A remains authoritative during later work.",
						strengths: [
							{
								summary: "The prior research found a supported strength.",
								evidence: [
									{
										label: "Prior strength source",
										url: "https://dossier.example.test/strength",
									},
								],
							},
						],
						concerns: [],
						criteria: dossierACriteria,
						missingInformation: ["Verified annual revenue"],
						recommendedAction: "Request normalized financial statements.",
						sourceUrls: ["https://dossier.example.test/strength"],
						researchedAt: timestampA,
					},
				},
			},
			select: { id: true },
		});
		companyIds.push(company.id);
		const companies = companyService();
		const dossierA = (await companies.byId(company.id)).acquisitionTarget;
		const now = new Date();
		const states = [
			{
				name: "queued",
				data: {
					dueAt: new Date(now.getTime() - 60_000),
					leasedUntil: new Date(now.getTime() + 60_000),
				},
				expected: { status: "queued", error: null },
			},
			{
				name: "running",
				data: {
					dueAt: new Date(now.getTime() - 60_000),
					startedAt: now,
				},
				expected: { status: "running", error: null },
			},
			{
				name: "retrying",
				data: {
					dueAt: new Date(now.getTime() - 60_000),
					startedAt: now,
					outcome: "retrying: provider timeout",
					lastError: "provider timeout",
				},
				expected: { status: "retrying", error: "provider timeout" },
			},
		] as const;

		for (const state of states) {
			await db.agentTask.deleteMany({ where: { companyId: company.id } });
			await db.agentTask.create({
				data: {
					companyId: company.id,
					kind: "acquisition-refresh",
					reason: `${state.name} acquisition research`,
					...state.data,
				},
			});

			const record = await companies.byId(company.id);

			expect(record.acquisitionResearch).toEqual(state.expected);
			expect(record.acquisitionTarget).toEqual(dossierA);
			expect(record.acquisitionTarget?.researchedAt).toBe(
				timestampA.toISOString(),
			);
			expect(record.enrichmentStatus).toBe(EnrichmentStatus.COMPLETE);
			expect(record.queuedKinds).toEqual(["acquisition-refresh"]);
		}

		await db.agentTask.deleteMany({ where: { companyId: company.id } });
		await db.agentTask.create({
			data: {
				companyId: company.id,
				kind: "acquisition-refresh",
				reason: "Successful acquisition research",
				dueAt: new Date(now.getTime() - 60_000),
				startedAt: now,
				finishedAt: now,
				outcome: "completed",
			},
		});

		const completed = await companies.byId(company.id);
		expect(completed.acquisitionResearch).toEqual({
			status: "idle",
			error: null,
		});
		expect(completed.acquisitionTarget).toEqual(dossierA);
	});

	it("parses valid criteria and reduces malformed legacy criteria to an empty list", async () => {
		const domain = `dossier-criteria-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: {
				name: "Dossier Criteria Target",
				domain,
				acquisitionTarget: {
					create: {
						strengths: [],
						concerns: [],
						criteria: dossierACriteria,
						missingInformation: [],
						sourceUrls: [],
					},
				},
			},
			select: { id: true },
		});
		companyIds.push(company.id);
		const companies = companyService();

		expect(
			(await companies.byId(company.id)).acquisitionTarget?.criteria,
		).toEqual(dossierACriteria);

		for (const criteria of [
			[{ ...dossierACriteria[0], id: "invented-criterion" }],
			[{ ...dossierACriteria[0], result: "LIKELY" }],
			[{ ...dossierACriteria[0], explanation: " " }],
			[{ ...dossierACriteria[0], blocksQualification: "false" }],
			[{ ...dossierACriteria[0], blocksQualification: true }],
			...["MATCH", "PARTIAL", "CONCERN"].map((result) => [
				{ ...dossierACriteria[0], result, evidence: [] },
			]),
			[
				{
					...dossierACriteria[0],
					evidence: [{ label: "Source", url: "not a URL" }],
				},
			],
			...[
				"ftp://dossier.example.test/source",
				"mailto:source@example.test",
			].map((url) => [
				{
					...dossierACriteria[0],
					evidence: [{ label: "Source", url }],
				},
			]),
			{ legacy: true },
		]) {
			await db.acquisitionTarget.update({
				where: { companyId: company.id },
				data: { criteria },
			});

			expect(
				(await companies.byId(company.id)).acquisitionTarget?.criteria,
			).toEqual([]);
		}
	});

	it("removes unsafe finding evidence URLs from the read model", async () => {
		const domain = `dossier-findings-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: {
				name: "Dossier Finding Target",
				domain,
				acquisitionTarget: {
					create: {
						strengths: [
							{
								summary: "A supported operating strength.",
								evidence: [
									{
										label: "Company profile",
										url: `https://${domain}/profile`,
									},
									{
										label: "Unsafe source",
										url: "javascript:alert(document.domain)",
									},
								],
							},
						],
						concerns: [
							{
								summary: "A concern with unsafe evidence.",
								evidence: [{ label: "Local file", url: "file:///etc/passwd" }],
							},
						],
						criteria: [],
						missingInformation: [],
						sourceUrls: [],
					},
				},
			},
			select: { id: true },
		});
		companyIds.push(company.id);

		const target = (await companyService().byId(company.id)).acquisitionTarget;

		expect(target?.strengths).toEqual([
			{
				summary: "A supported operating strength.",
				evidence: [
					{
						label: "Company profile",
						url: `https://${domain}/profile`,
					},
				],
			},
		]);
		expect(target?.concerns).toEqual([
			{ summary: "A concern with unsafe evidence.", evidence: [] },
		]);
	});
});

describe("acquisition target mutations", () => {
	it("requires explicit promotion before acquisition research", async () => {
		const domain = `generic-research-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Generic CRM Company", domain },
		});
		companyIds.push(company.id);
		const companies = companyService();

		await expect(companies.research(company.id, "reviewer-1")).rejects.toThrow(
			"Add this company to targets before analyzing fit.",
		);
		await expect(
			companies.analyzeAcquisition(company.id, "reviewer-1"),
		).rejects.toThrow("Add this company to targets before analyzing fit.");
		expect(
			await db.acquisitionTarget.findUnique({
				where: { companyId: company.id },
			}),
		).toBeNull();
		expect(
			await db.agentTask.count({
				where: { companyId: company.id, kind: "acquisition-refresh" },
			}),
		).toBe(0);
	});

	it("returns not found instead of creating a lifecycle record", async () => {
		const domain = `generic-lifecycle-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Generic Lifecycle Company", domain },
		});
		companyIds.push(company.id);

		await expect(
			service().updateTarget(
				company.id,
				AcquisitionStage.QUALIFIED,
				"reviewer-1",
			),
		).rejects.toThrow("That target no longer exists.");
		expect(
			await db.acquisitionTarget.findUnique({
				where: { companyId: company.id },
			}),
		).toBeNull();
	});

	it("creates a manual company and acquisition target atomically", async () => {
		const domain = `manual-target-${crypto.randomUUID()}.test`;
		domains.push(domain);

		const result = await service().createTarget(
			{ name: "Manual Target", domain, idempotencyKey: crypto.randomUUID() },
			"reviewer-1",
		);
		companyIds.push(result.companyId);

		const company = await db.company.findUniqueOrThrow({
			where: { id: result.companyId },
			include: { acquisitionTarget: true },
		});

		expect(result).toMatchObject({
			companyId: company.id,
			created: true,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "queued" },
		});
		expect(company).toMatchObject({
			name: "Manual Target",
			domain,
			website: `https://${domain}`,
			source: RecordSource.MANUAL,
			acquisitionTarget: {
				stage: AcquisitionStage.DISCOVERED,
				fit: AcquisitionFit.UNKNOWN,
			},
		});
	});

	it("converges concurrent manual target creation by normalized domain", async () => {
		const domain = `manual-concurrent-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const acquisition = service();
		const settled = await Promise.allSettled(
			Array.from({ length: 20 }, (_, index) =>
				acquisition.createTarget(
					{
						name: `Manual Concurrent ${index}`,
						idempotencyKey: crypto.randomUUID(),
						domain:
							index % 2 === 0
								? `https://www.${domain}/about`
								: domain.toUpperCase(),
					},
					"reviewer-1",
				),
			),
		);

		expect(settled.filter((result) => result.status === "rejected")).toEqual(
			[],
		);
		const results = settled.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
		const companyId = results[0]?.companyId;
		expect(companyId).toBeString();
		if (!companyId) throw new Error("Manual creation returned no company.");
		companyIds.push(companyId);

		expect(new Set(results.map((result) => result.companyId)).size).toBe(1);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(results.filter((result) => result.targetCreated)).toHaveLength(1);
		expect(await db.company.count({ where: { domain } })).toBe(1);
		expect(await db.acquisitionTarget.count({ where: { companyId } })).toBe(1);
		expect(
			await db.agentTask.count({
				where: {
					companyId,
					kind: "acquisition-refresh",
					finishedAt: null,
				},
			}),
		).toBe(1);
	});

	it("converges concurrent domainless creation with the same idempotency key", async () => {
		const acquisition = service();
		const name = `Domainless Manual ${crypto.randomUUID()}`;
		const idempotencyKey = crypto.randomUUID();
		const settled = await Promise.allSettled(
			Array.from({ length: 20 }, () =>
				acquisition.createTarget({ name, idempotencyKey }, "reviewer-1"),
			),
		);

		expect(settled.filter((result) => result.status === "rejected")).toEqual(
			[],
		);
		const results = settled.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
		const resultCompanyIds = [
			...new Set(results.map((result) => result.companyId)),
		];
		companyIds.push(...resultCompanyIds);

		expect(resultCompanyIds).toHaveLength(1);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(results.filter((result) => result.targetCreated)).toHaveLength(1);
		expect(
			await db.acquisitionTarget.count({
				where: { companyId: { in: resultCompanyIds } },
			}),
		).toBe(1);
	});

	it("keeps same-name domainless targets distinct across different keys", async () => {
		const acquisition = service();
		const name = `Domainless Manual ${crypto.randomUUID()}`;
		const first = await acquisition.createTarget(
			{ name, idempotencyKey: crypto.randomUUID() },
			"reviewer-1",
		);
		const second = await acquisition.createTarget(
			{ name, idempotencyKey: crypto.randomUUID() },
			"reviewer-1",
		);
		companyIds.push(first.companyId, second.companyId);

		expect(first.companyId).not.toBe(second.companyId);
		expect(first.created).toBe(true);
		expect(second.created).toBe(true);
	});

	it("promotes an existing company without changing any company field", async () => {
		const domain = `preserved-target-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const enrichedAt = new Date("2026-07-01T12:00:00.000Z");
		const company = await db.company.create({
			data: {
				name: "Preserved Target",
				domain,
				website: `https://${domain}/about`,
				description: "A populated company record.",
				logoUrl: `https://${domain}/logo.svg`,
				logoDarkUrl: `https://${domain}/logo-dark.svg`,
				iconUrl: `https://${domain}/icon.svg`,
				iconDarkUrl: `https://${domain}/icon-dark.svg`,
				iconTone: "LIGHT",
				brandColor: "#123456",
				industry: "Industrial services",
				subIndustry: "Field services",
				city: "Tulsa",
				stateCode: "OK",
				country: "United States",
				countryCode: "US",
				phone: "+1 918 555 0100",
				email: `hello@${domain}`,
				linkedinUrl: `https://linkedin.com/company/${domain}`,
				twitterUrl: `https://x.com/${domain.replaceAll(".", "-")}`,
				githubUrl: `https://github.com/${domain.replaceAll(".", "-")}`,
				pricingUrl: `https://${domain}/pricing`,
				careersUrl: `https://${domain}/careers`,
				enrichmentStatus: EnrichmentStatus.COMPLETE,
				enrichedAt,
				enrichmentError: "Historical warning",
				source: RecordSource.IMPORT,
				lastActivityAt: new Date("2026-07-02T12:00:00.000Z"),
			},
		});
		companyIds.push(company.id);
		const before = await db.company.findUniqueOrThrow({
			where: { id: company.id },
		});

		const result = await service().addTarget(company.id, "reviewer-1");
		const after = await db.company.findUniqueOrThrow({
			where: { id: company.id },
		});

		expect(after).toEqual(before);
		expect(result).toMatchObject({
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "queued" },
		});
	});

	it("creates a discovered target but blocks research without a domain", async () => {
		const company = await db.company.create({
			data: { name: `Domainless ${crypto.randomUUID()}` },
		});
		companyIds.push(company.id);

		const result = await service().addTarget(company.id, "reviewer-1");

		expect(result).toEqual({
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "blocked", blocker: "missing-domain" },
		});
		expect(
			await db.agentTask.count({
				where: {
					companyId: company.id,
					kind: "acquisition-refresh",
					finishedAt: null,
				},
			}),
		).toBe(0);
	});

	it("blocks target research without any configured buy-box criteria", async () => {
		const domain = `unfocused-target-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Unfocused Target", domain },
		});
		companyIds.push(company.id);
		await db.acquisitionProfile.update({
			where: { id: WORKSPACE_ID },
			data: {
				preferredIndustries: [],
				geographies: [],
				excludedCategories: [],
				revenueMin: null,
				revenueMax: null,
				ebitdaMin: null,
				ebitdaMax: null,
				purchasePriceMin: null,
				purchasePriceMax: null,
				ownerInvolvement: null,
				recurringRevenuePreference: null,
				customerConcentrationMax: null,
				assetPreference: null,
				financingAssumptions: null,
			},
		});

		const result = await service().addTarget(company.id, "reviewer-1");

		expect(result).toEqual({
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "blocked", blocker: "missing-buy-box" },
		});
		expect(
			await db.agentTask.count({
				where: { companyId: company.id, kind: "acquisition-refresh" },
			}),
		).toBe(0);
	});

	it("queues research for a financial-only buy box without industry or geography", async () => {
		const domain = `financial-only-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Financial Only Target", domain },
		});
		companyIds.push(company.id);
		await db.acquisitionProfile.update({
			where: { id: WORKSPACE_ID },
			data: {
				preferredIndustries: [],
				geographies: [],
				excludedCategories: [],
				revenueMin: 1_000_000,
				revenueMax: null,
				ebitdaMin: null,
				ebitdaMax: null,
				purchasePriceMin: null,
				purchasePriceMax: null,
				ownerInvolvement: null,
				recurringRevenuePreference: null,
				customerConcentrationMax: null,
				assetPreference: null,
				financingAssumptions: null,
			},
		});

		const result = await service().addTarget(company.id, "reviewer-1");

		expect(result.research.status).toBe("queued");
		expect(result.stage).toBe(AcquisitionStage.DISCOVERED);
	});

	it("reports queue failure and leaves the target discovered", async () => {
		const domain = `queue-failure-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Queue Failure", domain },
		});
		companyIds.push(company.id);
		const agent = {
			acquisitionTargetRequested: async () => {
				throw new Error("Queue unavailable.");
			},
		} as unknown as AgentTriggerService;

		const result = await service(agent).addTarget(company.id, "reviewer-1");

		expect(result).toEqual({
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "failed", blocker: "queue-unavailable" },
		});
	});

	it("converges twenty concurrent promotions on one target and task", async () => {
		const domain = `concurrent-target-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Concurrent Target", domain },
		});
		companyIds.push(company.id);
		const acquisition = service();

		const results = await Promise.all(
			Array.from({ length: 20 }, () =>
				acquisition.addTarget(company.id, "reviewer-1"),
			),
		);

		expect(results.filter((result) => result.targetCreated)).toHaveLength(1);
		expect(
			new Set(
				results.map((result) =>
					result.research.status === "queued"
						? result.research.taskId
						: result.research.status,
				),
			).size,
		).toBe(1);
		expect(
			await db.acquisitionTarget.count({ where: { companyId: company.id } }),
		).toBe(1);
		expect(
			await db.agentTask.count({
				where: {
					companyId: company.id,
					kind: "acquisition-refresh",
					finishedAt: null,
				},
			}),
		).toBe(1);
	});

	for (const stage of [
		AcquisitionStage.QUALIFIED,
		AcquisitionStage.REJECTED,
		AcquisitionStage.ACQUIRED,
	]) {
		it(`preserves ${stage} when an existing target is promoted again`, async () => {
			const domain = `repeat-${stage.toLowerCase()}-${crypto.randomUUID()}.test`;
			domains.push(domain);
			const company = await db.company.create({
				data: {
					name: `${stage} Target`,
					domain,
					acquisitionTarget: {
						create: {
							stage,
							strengths: [],
							concerns: [],
							missingInformation: [],
							sourceUrls: [],
						},
					},
				},
			});
			companyIds.push(company.id);

			const result = await service().addTarget(company.id, "reviewer-1");

			expect(result).toMatchObject({
				companyId: company.id,
				targetCreated: false,
				stage,
				research: { status: "queued" },
			});
			expect(
				await db.acquisitionTarget.findUniqueOrThrow({
					where: { companyId: company.id },
				}),
			).toMatchObject({ stage });
		});
	}
});

describe("acquisition candidate review", () => {
	it("turns an approved candidate into one researched acquisition target", async () => {
		const domain = `candidate-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Candidate Mechanical",
				domain,
				website: `https://${domain}`,
				rationale:
					"The service mix is relevant to the current acquisition thesis.",
				evidence:
					"The company site names commercial HVAC maintenance services.",
				sourceUrl: `https://${domain}/services`,
			},
		});

		const approved = await service().approveCandidate(
			candidate.id,
			"reviewer-1",
		);
		const company = await db.company.findUniqueOrThrow({
			where: { id: approved.companyId },
			include: { acquisitionTarget: true, discoveryCandidate: true },
		});
		const tasks = await db.agentTask.findMany({
			where: { companyId: company.id, finishedAt: null },
			select: { kind: true },
		});

		expect(approved.created).toBe(true);
		expect(company.source).toBe(RecordSource.DISCOVERY);
		expect(company.acquisitionTarget?.stage).toBe(AcquisitionStage.DISCOVERED);
		expect(company.acquisitionTarget?.fit).toBe(AcquisitionFit.UNKNOWN);
		expect(company.discoveryCandidate?.status).toBe(
			AcquisitionCandidateStatus.APPROVED,
		);
		expect(tasks.map((task) => task.kind).sort()).toEqual([
			"acquisition-refresh",
			"brand",
			"company-details",
		]);

		const approvedAgain = await service().approveCandidate(
			candidate.id,
			"reviewer-1",
		);
		expect(approvedAgain).toMatchObject({
			candidateId: candidate.id,
			companyId: company.id,
			created: false,
			targetCreated: false,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "queued" },
		});
		expect(
			await db.acquisitionCandidate.findUnique({ where: { id: candidate.id } }),
		).toMatchObject({ status: AcquisitionCandidateStatus.APPROVED });
		expect(
			await db.agentTask.count({
				where: { companyId: company.id, finishedAt: null },
			}),
		).toBe(3);
	});

	it("keeps dismissed candidates out of the CRM", async () => {
		const domain = `dismissed-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Dismissed Candidate",
				domain,
				website: `https://${domain}`,
				rationale:
					"The candidate needs a review before it can become a target.",
				evidence:
					"The source confirms that the business and its website exist.",
				sourceUrl: `https://${domain}`,
			},
		});

		await service().dismissCandidate(candidate.id);

		const dismissed = await db.acquisitionCandidate.findUnique({
			where: { id: candidate.id },
		});
		expect(dismissed).toMatchObject({
			status: AcquisitionCandidateStatus.DISMISSED,
			dismissedAt: expect.any(Date),
			dismissedBuyBoxRevision: expect.any(Number),
		});
		expect(await db.company.findFirst({ where: { domain } })).toBeNull();
	});

	it("skips reproposing a dismissed candidate until the buy box revision advances", async () => {
		const domain = `revival-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Revival Candidate",
				domain,
				website: `https://${domain}`,
				rationale:
					"The candidate was dismissed but may return after buy box changes.",
				evidence: "The source confirms the operating company exists.",
				sourceUrl: `https://${domain}`,
			},
		});

		await service().dismissCandidate(candidate.id);

		const proposal = {
			name: "Revival Candidate",
			domain,
			website: `https://${domain}`,
			rationale:
				"Updated thesis still points at the same operating company profile.",
			evidence: "Fresh evidence from the company website confirms services.",
			sourceUrl: `https://${domain}/services`,
		};

		const blocked = await proposeAcquisitionCandidates(db, WORKSPACE_ID, [
			proposal,
		]);
		expect(blocked).toMatchObject({ saved: 0, revived: 0, skipped: 1 });

		await db.acquisitionProfile.update({
			where: { id: WORKSPACE_ID },
			data: {
				preferredIndustries: ["Updated industrial services"],
				buyBoxRevision: { increment: 1 },
			},
		});

		const revived = await proposeAcquisitionCandidates(db, WORKSPACE_ID, [
			proposal,
		]);
		expect(revived).toMatchObject({ saved: 0, revived: 1, skipped: 0 });

		const row = await db.acquisitionCandidate.findUnique({
			where: { id: candidate.id },
		});
		expect(row).toMatchObject({
			id: candidate.id,
			status: AcquisitionCandidateStatus.PROPOSED,
			rationale: proposal.rationale,
			dismissedAt: null,
			dismissedBuyBoxRevision: null,
		});
	});

	it("attaches a candidate to an existing company without duplicating it", async () => {
		const domain = `existing-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Existing Company", domain, website: `https://${domain}` },
		});
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Existing Company",
				domain,
				website: `https://${domain}`,
				rationale:
					"The existing company record also matches the acquisition thesis.",
				evidence:
					"The source confirms the operating company and its service focus.",
				sourceUrl: `https://${domain}`,
			},
		});

		const approved = await service().approveCandidate(
			candidate.id,
			"reviewer-1",
		);

		expect(approved).toMatchObject({
			candidateId: candidate.id,
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "queued" },
		});
		expect(await db.company.count({ where: { domain } })).toBe(1);
		expect(
			await db.acquisitionTarget.findUnique({
				where: { companyId: company.id },
			}),
		).toMatchObject({ stage: AcquisitionStage.DISCOVERED });
		expect(
			await db.agentTask.count({
				where: {
					companyId: company.id,
					kind: "acquisition-refresh",
					finishedAt: null,
				},
			}),
		).toBe(1);
	});

	it("converges concurrent approvals on one company, target, and task", async () => {
		const domain = `concurrent-candidate-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Concurrent Candidate",
				domain,
				website: `https://${domain}`,
				rationale: "The candidate matches the current acquisition focus.",
				evidence: "The source confirms the company and service category.",
				sourceUrl: `https://${domain}/services`,
			},
		});
		const acquisition = service();

		const settled = await Promise.allSettled(
			Array.from({ length: 20 }, () =>
				acquisition.approveCandidate(candidate.id, "reviewer-1"),
			),
		);
		expect(settled.filter((result) => result.status === "rejected")).toEqual(
			[],
		);
		const results = settled.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
		const ids = new Set(results.map((result) => result.companyId));
		const companyId = results[0]?.companyId;
		expect(companyId).toBeString();
		if (!companyId) throw new Error("Concurrent approval returned no company.");
		companyIds.push(companyId);

		expect(ids.size).toBe(1);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(results.filter((result) => result.targetCreated)).toHaveLength(1);
		expect(
			new Set(
				results.map((result) =>
					result.research.status === "queued"
						? result.research.taskId
						: result.research.status,
				),
			).size,
		).toBe(1);
		expect(await db.company.count({ where: { domain } })).toBe(1);
		expect(await db.acquisitionTarget.count({ where: { companyId } })).toBe(1);
		expect(
			await db.agentTask.count({
				where: {
					companyId,
					kind: "acquisition-refresh",
					finishedAt: null,
				},
			}),
		).toBe(1);
		expect(
			await db.acquisitionCandidate.findUniqueOrThrow({
				where: { id: candidate.id },
			}),
		).toMatchObject({
			companyId,
			status: AcquisitionCandidateStatus.APPROVED,
		});
	});

	for (const stage of [
		AcquisitionStage.QUALIFIED,
		AcquisitionStage.REJECTED,
		AcquisitionStage.ACQUIRED,
	]) {
		it(`preserves ${stage} when an approved candidate is retried`, async () => {
			const domain = `approved-${stage.toLowerCase()}-${crypto.randomUUID()}.test`;
			domains.push(domain);
			const company = await db.company.create({
				data: {
					name: `${stage} Approved Candidate`,
					domain,
					source: RecordSource.DISCOVERY,
					acquisitionTarget: {
						create: {
							stage,
							strengths: [],
							concerns: [],
							missingInformation: [],
							sourceUrls: [`https://${domain}`],
						},
					},
				},
			});
			companyIds.push(company.id);
			const candidate = await db.acquisitionCandidate.create({
				data: {
					name: company.name,
					domain,
					website: `https://${domain}`,
					rationale: "The candidate remains linked to its target.",
					evidence: "The source confirms the existing company.",
					sourceUrl: `https://${domain}`,
					status: AcquisitionCandidateStatus.APPROVED,
					companyId: company.id,
				},
			});

			const result = await service().approveCandidate(
				candidate.id,
				"reviewer-1",
			);

			expect(result).toMatchObject({
				candidateId: candidate.id,
				companyId: company.id,
				targetCreated: false,
				stage,
				research: { status: "queued" },
			});
			expect(
				await db.acquisitionTarget.findUniqueOrThrow({
					where: { companyId: company.id },
				}),
			).toMatchObject({ stage });
		});
	}

	it("keeps detail refresh separate from acquisition analysis", async () => {
		const domain = `actions-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: {
				name: "Action Target",
				domain,
				website: `https://${domain}`,
				acquisitionTarget: {
					create: {
						strengths: [],
						concerns: [],
						missingInformation: [],
						sourceUrls: [],
					},
				},
			},
		});
		const companies = companyService();

		await companies.enrich(company.id);

		expect(
			(
				await db.agentTask.findMany({
					where: { companyId: company.id, finishedAt: null },
					select: { kind: true },
				})
			)
				.map((task) => task.kind)
				.sort(),
		).toEqual(["brand", "company-details"]);

		await db.agentTask.deleteMany({ where: { companyId: company.id } });
		await companies.analyzeAcquisition(company.id, "reviewer-1");

		expect(
			await db.agentTask.findMany({
				where: { companyId: company.id, finishedAt: null },
				select: { kind: true },
			}),
		).toEqual([{ kind: "acquisition-refresh" }]);
	});

	it("requires a focused buy box before a manual fit analysis", async () => {
		let requested = false;
		const companies = new CompaniesService(
			{
				company: {
					findUnique: async () => ({
						id: "unfocused-target",
						domain: "target.test",
						acquisitionTarget: { companyId: "unfocused-target" },
					}),
				},
				acquisitionProfile: {
					findUnique: async () => ({
						mode: WorkspaceMode.ACQUISITION,
						preferredIndustries: [],
						geographies: [],
						excludedCategories: [],
						revenueMin: null,
						revenueMax: null,
						ebitdaMin: null,
						ebitdaMax: null,
						purchasePriceMin: null,
						purchasePriceMax: null,
						ownerInvolvement: null,
						recurringRevenuePreference: null,
						customerConcentrationMax: null,
						assetPreference: null,
						financingAssumptions: null,
					}),
				},
			} as never,
			{
				acquisitionTargetRequested: async () => {
					requested = true;
				},
			} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);

		await expect(
			companies.research("unfocused-target", "reviewer-1"),
		).rejects.toThrow("Complete at least one buy-box criterion");
		expect(requested).toBe(false);
	});
});

describe("eve recommendations and acquisition engagements", () => {
	it("accepts and dismisses Eve stage recommendations", async () => {
		await ensureWorkspaceMember(
			"reviewer-1",
			"reviewer-1@example.com",
			"Reviewer",
		);
		const domain = `eve-stage-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: {
				name: "Eve Stage Target",
				domain,
				acquisitionTarget: {
					create: {
						stage: AcquisitionStage.DISCOVERED,
						fit: AcquisitionFit.POTENTIAL,
						strengths: [],
						concerns: [],
						missingInformation: [],
						sourceUrls: [],
						recommendedStage: AcquisitionStage.QUALIFIED,
					},
				},
			},
		});
		companyIds.push(company.id);
		const idempotencyKey = crypto.randomUUID();

		const accepted = await service().acceptRecommendedStage(
			company.id,
			"reviewer-1",
			idempotencyKey,
		);
		expect(accepted).toMatchObject({
			companyId: company.id,
			stage: AcquisitionStage.QUALIFIED,
			recommendedStage: null,
		});
		expect(
			await db.activity.count({
				where: {
					companyId: company.id,
					type: ActivityType.STAGE_CHANGE,
					meta: { path: ["source"], equals: "eve-recommendation" },
				},
			}),
		).toBe(1);

		const acceptedAgain = await service().acceptRecommendedStage(
			company.id,
			"reviewer-1",
			idempotencyKey,
		);
		expect(acceptedAgain.stage).toBe(AcquisitionStage.QUALIFIED);

		await db.acquisitionTarget.update({
			where: { companyId: company.id },
			data: { recommendedStage: AcquisitionStage.WATCHLIST },
		});
		const dismissed = await service().dismissRecommendedStage(
			company.id,
			"reviewer-1",
		);
		expect(dismissed).toMatchObject({
			stage: AcquisitionStage.QUALIFIED,
			recommendedStage: null,
		});
	});

	it("accepts and dismisses Eve action recommendations", async () => {
		await ensureWorkspaceMember(
			"reviewer-1",
			"reviewer-1@example.com",
			"Reviewer",
		);
		const domain = `eve-action-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: {
				name: "Eve Action Target",
				domain,
				acquisitionTarget: {
					create: {
						stage: AcquisitionStage.QUALIFIED,
						fit: AcquisitionFit.STRONG,
						strengths: [],
						concerns: [],
						missingInformation: [],
						sourceUrls: [],
						recommendedAction: "Request owner financials",
					},
				},
			},
		});
		companyIds.push(company.id);
		const idempotencyKey = crypto.randomUUID();

		const accepted = await service().acceptRecommendedAction(
			company.id,
			"reviewer-1",
			idempotencyKey,
		);
		expect(accepted.taskId).toBeString();
		expect(
			await db.acquisitionTarget.findUnique({
				where: { companyId: company.id },
				select: { recommendedAction: true },
			}),
		).toMatchObject({ recommendedAction: null });

		await db.acquisitionTarget.update({
			where: { companyId: company.id },
			data: { recommendedAction: "Schedule diligence call" },
		});
		const dismissed = await service().dismissRecommendedAction(
			company.id,
			"reviewer-1",
		);
		expect(dismissed).toEqual({
			companyId: company.id,
			recommendedAction: null,
		});
	});

	it("creates engagements with idempotency and one active row per company", async () => {
		const domain = `engagement-${crypto.randomUUID()}.test`;
		const company = await createEngagementTargetCompany(domain);
		const idempotencyKey = crypto.randomUUID();
		const acquisition = service();
		await ensureWorkspaceMember(
			"reviewer-1",
			"reviewer-1@example.com",
			"Reviewer",
		);

		const created = await acquisition.createEngagement(
			{
				companyId: company.id,
				idempotencyKey,
				stage: AcquisitionEngagementStage.OUTREACH,
			},
			"reviewer-1",
		);
		expect(created).toMatchObject({
			companyId: company.id,
			stage: AcquisitionEngagementStage.OUTREACH,
			status: AcquisitionEngagementStatus.ACTIVE,
		});

		const again = await acquisition.createEngagement(
			{ companyId: company.id, idempotencyKey },
			"reviewer-1",
		);
		expect(again.id).toBe(created.id);

		await expect(
			acquisition.createEngagement(
				{ companyId: company.id, idempotencyKey: crypto.randomUUID() },
				"reviewer-1",
			),
		).rejects.toThrow("already has an active acquisition opportunity");

		const listed = await acquisition.listEngagements({
			companyId: company.id,
			status: "active",
		});
		expect(listed.rows).toHaveLength(1);

		const updated = await acquisition.updateEngagementStage(
			{
				engagementId: created.id,
				stage: AcquisitionEngagementStage.ENGAGED,
			},
			"reviewer-1",
		);
		expect(updated.stage).toBe(AcquisitionEngagementStage.ENGAGED);

		const expectedCloseDate = new Date(Date.now() + 30 * 86_400_000);
		const edited = await acquisition.updateEngagement({
			engagementId: created.id,
			ownerId: null,
			amountCents: 450_000_00,
			currency: "USD",
			expectedCloseDate: expectedCloseDate.toISOString(),
		});
		expect(edited).toMatchObject({
			ownerId: null,
			amountCents: 450_000_00,
			currency: "USD",
			expectedCloseDate: expectedCloseDate.toISOString(),
		});
	});

	it("rejects engagement creation for a company without a target", async () => {
		const domain = `no-target-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Generic Company", domain },
		});
		companyIds.push(company.id);
		await ensureWorkspaceMember(
			"reviewer-1",
			"reviewer-1@example.com",
			"Reviewer",
		);

		await expect(
			service().createEngagement(
				{ companyId: company.id, idempotencyKey: crypto.randomUUID() },
				"reviewer-1",
			),
		).rejects.toThrow(
			"Add this company to Targets before opening an acquisition opportunity.",
		);
		expect(await db.acquisitionEngagement.count()).toBe(0);
	});

	it("resolves engagement owners from explicit, company, and acting user", async () => {
		const suffix = crypto.randomUUID();
		const actingUserId = `acting-${suffix}`;
		const explicitOwnerId = `explicit-${suffix}`;
		const companyOwnerId = `company-owner-${suffix}`;
		await ensureWorkspaceMember(
			actingUserId,
			`acting-${suffix}@example.com`,
			"Acting User",
		);
		await ensureWorkspaceMember(
			explicitOwnerId,
			`explicit-${suffix}@example.com`,
			"Explicit Owner",
		);
		await ensureWorkspaceMember(
			companyOwnerId,
			`company-owner-${suffix}@example.com`,
			"Company Owner",
		);

		const explicitCompany = await createEngagementTargetCompany(
			`explicit-owner-${suffix}.test`,
			companyOwnerId,
		);
		const explicit = await service().createEngagement(
			{
				companyId: explicitCompany.id,
				idempotencyKey: crypto.randomUUID(),
				ownerId: explicitOwnerId,
			},
			actingUserId,
		);
		expect(explicit.ownerId).toBe(explicitOwnerId);

		const companyOwned = await createEngagementTargetCompany(
			`company-owner-${suffix}.test`,
			companyOwnerId,
		);
		const fromCompany = await service().createEngagement(
			{
				companyId: companyOwned.id,
				idempotencyKey: crypto.randomUUID(),
			},
			actingUserId,
		);
		expect(fromCompany.ownerId).toBe(companyOwnerId);

		const unassigned = await createEngagementTargetCompany(
			`acting-owner-${suffix}.test`,
			null,
		);
		const fromActing = await service().createEngagement(
			{
				companyId: unassigned.id,
				idempotencyKey: crypto.randomUUID(),
			},
			actingUserId,
		);
		expect(fromActing.ownerId).toBe(actingUserId);

		const outsideOwnerCompany = await createEngagementTargetCompany(
			`outside-owner-${suffix}.test`,
			null,
		);
		await expect(
			service().createEngagement(
				{
					companyId: outsideOwnerCompany.id,
					idempotencyKey: crypto.randomUUID(),
					ownerId: `outside-${suffix}`,
				},
				actingUserId,
			),
		).rejects.toThrow("That owner is not in this workspace.");
	});

	it("rejects idempotent replay for a different company or workspace", async () => {
		const suffix = crypto.randomUUID();
		const actingUserId = `acting-${suffix}`;
		await ensureWorkspaceMember(
			actingUserId,
			`acting-${suffix}@example.com`,
			"Acting User",
		);
		const idempotencyKey = crypto.randomUUID();
		const companyA = await createEngagementTargetCompany(
			`idempotent-a-${suffix}.test`,
		);
		const companyB = await createEngagementTargetCompany(
			`idempotent-b-${suffix}.test`,
		);
		const acquisition = service();
		await acquisition.createEngagement(
			{ companyId: companyA.id, idempotencyKey },
			actingUserId,
		);

		await expect(
			acquisition.createEngagement(
				{ companyId: companyB.id, idempotencyKey },
				actingUserId,
			),
		).rejects.toThrow(
			"This request id has already been used for another opportunity.",
		);

		const isolatedOrgId = crypto.randomUUID();
		const isolatedDomain = `isolated-idempotent-${suffix}.test`;
		await db.organization.create({
			data: {
				id: isolatedOrgId,
				name: "Isolated Engagement Org",
				slug: `iso-eng-${suffix}`,
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
				const isolatedCompany = await db.company.create({
					data: {
						name: "Isolated Engagement Target",
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
				await expect(
					acquisition.createEngagement(
						{
							companyId: isolatedCompany.id,
							idempotencyKey,
						},
						actingUserId,
					),
				).rejects.toThrow(
					"This request id has already been used for another opportunity.",
				);
			});
		} finally {
			await runInOrganization(isolatedOrgId, async () => {
				await db.company.deleteMany({ where: { domain: isolatedDomain } });
				await db.acquisitionProfile.deleteMany({
					where: { id: isolatedOrgId },
				});
			});
			await db.organization.delete({ where: { id: isolatedOrgId } });
		}
	});

	for (const terminalStage of [
		AcquisitionEngagementStage.PASSED,
		AcquisitionEngagementStage.ACQUIRED,
	] as const) {
		it(`keeps ${terminalStage} engagements terminal and allows a later pursuit`, async () => {
			const suffix = crypto.randomUUID();
			const actingUserId = `acting-${suffix}`;
			await ensureWorkspaceMember(
				actingUserId,
				`acting-${suffix}@example.com`,
				"Acting User",
			);
			const company = await createEngagementTargetCompany(
				`terminal-${terminalStage.toLowerCase()}-${suffix}.test`,
			);
			const acquisition = service();
			const first = await acquisition.createEngagement(
				{
					companyId: company.id,
					idempotencyKey: crypto.randomUUID(),
				},
				actingUserId,
			);
			if (terminalStage === AcquisitionEngagementStage.PASSED) {
				await expect(
					acquisition.updateEngagementStage(
						{ engagementId: first.id, stage: terminalStage },
						actingUserId,
					),
				).rejects.toThrow("Add a reason before passing");
			}
			const closed = await acquisition.updateEngagementStage(
				{
					engagementId: first.id,
					stage: terminalStage,
					closedReason:
						terminalStage === AcquisitionEngagementStage.PASSED
							? "Seller expectations exceed the buy box."
							: undefined,
				},
				actingUserId,
			);
			expect(closed.status).toBe(AcquisitionEngagementStatus.TERMINAL);
			expect(closed.closedAt).not.toBeNull();
			expect(closed.closedReason).toBe(
				terminalStage === AcquisitionEngagementStage.PASSED
					? "Seller expectations exceed the buy box."
					: null,
			);

			await expect(
				acquisition.updateEngagementStage(
					{
						engagementId: first.id,
						stage: AcquisitionEngagementStage.OUTREACH,
					},
					actingUserId,
				),
			).rejects.toThrow(
				"This acquisition opportunity is closed and cannot be moved to another stage.",
			);

			const second = await acquisition.createEngagement(
				{
					companyId: company.id,
					idempotencyKey: crypto.randomUUID(),
				},
				actingUserId,
			);
			expect(second.id).not.toBe(first.id);
			expect(second.status).toBe(AcquisitionEngagementStatus.ACTIVE);

			const rows = await acquisition.listEngagements({
				companyId: company.id,
				status: "all",
			});
			expect(rows.rows).toHaveLength(2);
		});
	}

	it("converges concurrent engagement creation on one active row", async () => {
		const suffix = crypto.randomUUID();
		const actingUserId = `acting-${suffix}`;
		await ensureWorkspaceMember(
			actingUserId,
			`acting-${suffix}@example.com`,
			"Acting User",
		);
		const company = await createEngagementTargetCompany(
			`concurrent-engagement-${suffix}.test`,
		);
		const acquisition = service();
		const sharedKey = crypto.randomUUID();

		const differentKeyResults = await Promise.allSettled(
			Array.from({ length: 20 }, () =>
				acquisition.createEngagement(
					{
						companyId: company.id,
						idempotencyKey: crypto.randomUUID(),
					},
					actingUserId,
				),
			),
		);
		const differentKeySuccesses = differentKeyResults.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
		const differentKeyConflicts = differentKeyResults.filter(
			(result) =>
				result.status === "rejected" &&
				result.reason instanceof Error &&
				result.reason.message.includes(
					"already has an active acquisition opportunity",
				),
		);
		expect(differentKeySuccesses).toHaveLength(1);
		expect(differentKeyConflicts.length).toBeGreaterThan(0);
		const firstSuccess = differentKeySuccesses[0];
		if (!firstSuccess) {
			throw new Error("Expected one concurrent engagement create to succeed.");
		}
		expect(
			await db.acquisitionEngagement.count({
				where: {
					companyId: company.id,
					status: AcquisitionEngagementStatus.ACTIVE,
				},
			}),
		).toBe(1);

		await acquisition.updateEngagementStage(
			{
				engagementId: firstSuccess.id,
				stage: AcquisitionEngagementStage.PASSED,
				closedReason: "Closed before replaying the shared request.",
			},
			actingUserId,
		);

		const sameKeyResults = await Promise.allSettled(
			Array.from({ length: 20 }, () =>
				acquisition.createEngagement(
					{ companyId: company.id, idempotencyKey: sharedKey },
					actingUserId,
				),
			),
		);
		const sameKeySuccesses = sameKeyResults.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
		expect(sameKeySuccesses.length).toBeGreaterThan(0);
		expect(new Set(sameKeySuccesses.map((row) => row.id)).size).toBe(1);
		expect(
			await db.acquisitionEngagement.count({
				where: {
					companyId: company.id,
					status: AcquisitionEngagementStatus.ACTIVE,
				},
			}),
		).toBe(1);
	});

	it("lists engagements only for the current workspace", async () => {
		const suffix = crypto.randomUUID();
		const actingUserId = `acting-${suffix}`;
		await ensureWorkspaceMember(
			actingUserId,
			`acting-${suffix}@example.com`,
			"Acting User",
		);
		const isolatedOrgId = crypto.randomUUID();
		const isolatedDomain = `isolated-engagement-${suffix}.test`;
		let isolatedCompanyId = "";

		await db.organization.create({
			data: {
				id: isolatedOrgId,
				name: "Isolated Engagement Org",
				slug: `iso-list-${suffix}`,
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
						name: "Isolated Engagement Target",
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

			const listed = await service().listEngagements({
				status: "active",
			});
			expect(
				listed.rows.some(
					(engagement) => engagement.companyId === isolatedCompanyId,
				),
			).toBe(false);
		} finally {
			await runInOrganization(isolatedOrgId, async () => {
				await db.company.deleteMany({ where: { domain: isolatedDomain } });
				await db.acquisitionProfile.deleteMany({
					where: { id: isolatedOrgId },
				});
			});
			await db.organization.delete({ where: { id: isolatedOrgId } });
		}
	});
});
