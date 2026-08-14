import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import {
	AcquisitionFit,
	AcquisitionStage,
	ActivityType,
	db,
	WorkspaceMode,
} from "@crm/db";
import type { AcquisitionCriterionAssessment } from "@crm/db/acquisition";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { acquireCanonicalWorkspaceFixture } from "../../../packages/db/test/canonical-workspace-fixture";
import writeAcquisitionDossier from "../agent/tools/write_acquisition_dossier";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const domain = `acquisition-dossier-${suffix}.test`;
const userEmail = `acquisition-dossier-${suffix}@example.test`;
const timestampA = new Date("2026-01-15T12:00:00.000Z");
const dossierACriteria: AcquisitionCriterionAssessment[] = [
	{
		id: "industry",
		result: "PARTIAL",
		explanation: "The prior dossier found only partial industry alignment.",
		blocksQualification: false,
		evidence: [
			{
				label: "Prior industry source",
				url: "https://prior.example.test/industry",
			},
		],
	},
	{
		id: "geography",
		result: "MATCH",
		explanation: "The prior dossier placed the company in the target region.",
		blocksQualification: false,
		evidence: [
			{
				label: "Prior geography source",
				url: "https://prior.example.test/geography",
			},
		],
	},
	{
		id: "revenue",
		result: "UNKNOWN",
		explanation: "The prior dossier could not verify company revenue.",
		blocksQualification: true,
		evidence: [],
	},
];
const dossierAStrengths = [
	{
		summary: "The prior dossier found one supported strength.",
		evidence: [
			{
				label: "Prior strength source",
				url: "https://prior.example.test/strength",
			},
		],
	},
];
const dossierAConcerns = [
	{
		summary: "The prior dossier found one supported concern.",
		evidence: [
			{
				label: "Prior concern source",
				url: "https://prior.example.test/concern",
			},
		],
	},
];

type DossierInput = Parameters<typeof writeAcquisitionDossier.execute>[0];
type DossierContext = Parameters<typeof writeAcquisitionDossier.execute>[1];

let companyId: string;
let userId: string;
let previousProfile: Awaited<
	ReturnType<typeof db.acquisitionProfile.findUnique>
>;
let releaseCanonicalWorkspace: (() => Promise<void>) | undefined;

const toolContext = {
	session: { id: `acquisition-dossier-session-${suffix}` },
} as unknown as DossierContext;

const baseDossierB = {
	companyId: "",
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
};

const validCriteria: AcquisitionCriterionAssessment[] = [
	{
		id: "industry",
		result: "MATCH",
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
		id: "geography",
		result: "PARTIAL",
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
		id: "revenue",
		result: "UNKNOWN",
		explanation: "No reliable source states annual company revenue.",
		blocksQualification: true,
		evidence: [],
	},
];

beforeAll(async () => {
	releaseCanonicalWorkspace = await acquireCanonicalWorkspaceFixture();
	await cleanup();
	previousProfile = await db.acquisitionProfile.findUnique({
		where: { id: WORKSPACE_ID },
	});
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
			excludedCategories: [],
			currency: "USD",
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

	const user = await db.user.create({
		data: {
			id: `acquisition-dossier-user-${suffix}`,
			name: "Acquisition Dossier Owner",
			email: userEmail,
			emailVerified: true,
		},
		select: { id: true },
	});
	userId = user.id;

	const company = await db.company.create({
		data: {
			name: `Acquisition Dossier ${suffix}`,
			domain,
			ownerId: userId,
			lastActivityAt: timestampA,
		},
		select: { id: true },
	});
	companyId = company.id;
}, 120_000);

beforeEach(seedDossierA);

afterAll(async () => {
	try {
		await cleanup();

		if (previousProfile) {
			await db.acquisitionProfile.update({
				where: { id: WORKSPACE_ID },
				data: {
					mode: previousProfile.mode,
					preferredIndustries: previousProfile.preferredIndustries,
					geographies: previousProfile.geographies,
					excludedCategories: previousProfile.excludedCategories,
					currency: previousProfile.currency,
					revenueMin: previousProfile.revenueMin,
					revenueMax: previousProfile.revenueMax,
					ebitdaMin: previousProfile.ebitdaMin,
					ebitdaMax: previousProfile.ebitdaMax,
					purchasePriceMin: previousProfile.purchasePriceMin,
					purchasePriceMax: previousProfile.purchasePriceMax,
					ownerInvolvement: previousProfile.ownerInvolvement,
					recurringRevenuePreference:
						previousProfile.recurringRevenuePreference,
					customerConcentrationMax: previousProfile.customerConcentrationMax,
					assetPreference: previousProfile.assetPreference,
					financingAssumptions: previousProfile.financingAssumptions,
				},
			});
		} else {
			await db.acquisitionProfile.deleteMany({ where: { id: WORKSPACE_ID } });
		}
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

	if (companyIds.length > 0) {
		await db.activity.deleteMany({ where: { companyId: { in: companyIds } } });
		await db.agentTask.deleteMany({ where: { companyId: { in: companyIds } } });
		await db.acquisitionTarget.deleteMany({
			where: { companyId: { in: companyIds } },
		});
		await db.company.deleteMany({ where: { id: { in: companyIds } } });
	}

	await db.user.deleteMany({ where: { email: userEmail } });
}

async function seedDossierA(): Promise<void> {
	await db.activity.deleteMany({ where: { companyId } });
	await db.agentTask.deleteMany({ where: { companyId } });
	await db.acquisitionTarget.upsert({
		where: { companyId },
		create: {
			companyId,
			stage: AcquisitionStage.QUALIFIED,
			fit: AcquisitionFit.WEAK,
			summary: "Dossier A remains the last complete acquisition assessment.",
			strengths: dossierAStrengths,
			concerns: dossierAConcerns,
			criteria: dossierACriteria,
			missingInformation: ["Prior revenue gap"],
			recommendedAction: "Keep the prior dossier unchanged.",
			recommendedStage: AcquisitionStage.WATCHLIST,
			sourceUrls: ["https://prior.example.test/dossier"],
			researchedAt: timestampA,
			sourceSessionId: "dossier-a-session",
		},
		update: {
			stage: AcquisitionStage.QUALIFIED,
			fit: AcquisitionFit.WEAK,
			summary: "Dossier A remains the last complete acquisition assessment.",
			strengths: dossierAStrengths,
			concerns: dossierAConcerns,
			criteria: dossierACriteria,
			missingInformation: ["Prior revenue gap"],
			recommendedAction: "Keep the prior dossier unchanged.",
			recommendedStage: AcquisitionStage.WATCHLIST,
			sourceUrls: ["https://prior.example.test/dossier"],
			researchedAt: timestampA,
			sourceSessionId: "dossier-a-session",
		},
	});
	await db.company.update({
		where: { id: companyId },
		data: { ownerId: userId, lastActivityAt: timestampA },
	});
}

async function expectDossierA(): Promise<void> {
	const [target, company, activities, tasks] = await Promise.all([
		db.acquisitionTarget.findUnique({ where: { companyId } }),
		db.company.findUnique({
			where: { id: companyId },
			select: { lastActivityAt: true },
		}),
		db.activity.findMany({ where: { companyId } }),
		db.agentTask.findMany({ where: { companyId } }),
	]);

	expect(target).toMatchObject({
		stage: AcquisitionStage.QUALIFIED,
		fit: AcquisitionFit.WEAK,
		summary: "Dossier A remains the last complete acquisition assessment.",
		strengths: dossierAStrengths,
		concerns: dossierAConcerns,
		criteria: dossierACriteria,
		missingInformation: ["Prior revenue gap"],
		recommendedAction: "Keep the prior dossier unchanged.",
		recommendedStage: AcquisitionStage.WATCHLIST,
		sourceUrls: ["https://prior.example.test/dossier"],
		researchedAt: timestampA,
		sourceSessionId: "dossier-a-session",
	});
	expect(company?.lastActivityAt).toEqual(timestampA);
	expect(activities).toHaveLength(0);
	expect(tasks).toHaveLength(0);
}

const invalidCriteria = [
	{
		name: "duplicate",
		criteria: [validCriteria[0], validCriteria[0], validCriteria[2]],
	},
	{
		name: "missing",
		criteria: [validCriteria[0], validCriteria[1]],
	},
	{
		name: "reordered",
		criteria: [validCriteria[1], validCriteria[0], validCriteria[2]],
	},
	{
		name: "invented",
		criteria: [
			validCriteria[0],
			validCriteria[1],
			{ ...validCriteria[2], id: "invented-criterion" },
		],
	},
] as const;

describe("write_acquisition_dossier", () => {
	for (const invalid of invalidCriteria) {
		it(`preserves dossier A when criterion identity is ${invalid.name}`, async () => {
			const receivedIds = invalid.criteria.map((criterion) => criterion?.id);
			const result = await writeAcquisitionDossier.execute(
				{
					...baseDossierB,
					companyId,
					criteria: invalid.criteria,
				} as unknown as DossierInput,
				toolContext,
			);

			expect(result.written).toBe(false);
			if (result.written === false) {
				expect(result.reason).toContain(
					"Expected [industry, geography, revenue]",
				);
				expect(result.reason).toContain(`received [${receivedIds.join(", ")}]`);
			}
			await expectDossierA();
		});
	}

	it("refuses to create a target while writing a dossier", async () => {
		await db.acquisitionTarget.delete({ where: { companyId } });

		const result = await writeAcquisitionDossier.execute(
			{
				...baseDossierB,
				companyId,
				criteria: validCriteria,
			},
			toolContext,
		);

		expect(result).toEqual({
			written: false,
			reason:
				"This company is not an acquisition target. Add it to targets before writing a dossier.",
		});
		expect(
			await db.acquisitionTarget.findUnique({ where: { companyId } }),
		).toBeNull();
		expect(await db.activity.count({ where: { companyId } })).toBe(0);
	});

	it("commits dossier B, evidence sources, activity, and timestamps together", async () => {
		const startedAt = new Date();
		const result = await writeAcquisitionDossier.execute(
			{
				...baseDossierB,
				companyId,
				criteria: validCriteria,
			},
			toolContext,
		);
		const finishedAt = new Date();

		expect(result.written).toBe(true);
		const [target, company, activities, tasks] = await Promise.all([
			db.acquisitionTarget.findUnique({ where: { companyId } }),
			db.company.findUnique({
				where: { id: companyId },
				select: { lastActivityAt: true },
			}),
			db.activity.findMany({ where: { companyId } }),
			db.agentTask.findMany({ where: { companyId } }),
		]);

		expect(target).toMatchObject({
			stage: AcquisitionStage.QUALIFIED,
			fit: AcquisitionFit.POTENTIAL,
			summary: baseDossierB.summary,
			strengths: baseDossierB.strengths,
			concerns: baseDossierB.concerns,
			criteria: validCriteria,
			missingInformation: baseDossierB.missingInformation,
			recommendedAction: baseDossierB.recommendedAction,
			recommendedStage: baseDossierB.recommendedStage,
			sourceSessionId: toolContext.session.id,
		});
		expect(target?.sourceUrls).toHaveLength(3);
		expect(target?.sourceUrls).toEqual(
			expect.arrayContaining([
				"https://candidate.example.test/services",
				"https://candidate.example.test/customers",
				"https://candidate.example.test/locations",
			]),
		);
		expect(target?.researchedAt?.getTime()).toBeGreaterThanOrEqual(
			startedAt.getTime(),
		);
		expect(target?.researchedAt?.getTime()).toBeLessThanOrEqual(
			finishedAt.getTime(),
		);
		expect(company?.lastActivityAt).toEqual(target?.researchedAt);
		expect(activities).toHaveLength(1);
		expect(activities[0]).toMatchObject({
			type: ActivityType.ENRICHMENT,
			occurredAt: target?.researchedAt,
			createdById: userId,
		});
		expect(activities[0]?.body).toContain(baseDossierB.summary);
		expect(tasks).toHaveLength(0);
	});

	it("preserves dossier A when no activity author exists", async () => {
		await db.company.update({
			where: { id: companyId },
			data: { ownerId: null },
		});
		const authorLookup = db.user.findFirst;
		db.user.findFirst = (async () => null) as typeof db.user.findFirst;

		const observed = await (async () => {
			try {
				const result = await writeAcquisitionDossier.execute(
					{
						...baseDossierB,
						companyId,
						criteria: validCriteria,
					},
					toolContext,
				);
				const [target, company, activityCount] = await Promise.all([
					db.acquisitionTarget.findUnique({
						where: { companyId },
						select: {
							stage: true,
							fit: true,
							summary: true,
							strengths: true,
							concerns: true,
							criteria: true,
							missingInformation: true,
							recommendedAction: true,
							recommendedStage: true,
							sourceUrls: true,
							researchedAt: true,
							sourceSessionId: true,
						},
					}),
					db.company.findUnique({
						where: { id: companyId },
						select: { lastActivityAt: true },
					}),
					db.activity.count({ where: { companyId } }),
				]);

				return { result, target, company, activityCount };
			} finally {
				db.user.findFirst = authorLookup;
			}
		})();

		expect(observed).toEqual({
			result: {
				written: false,
				reason: "No user to attribute to.",
			},
			target: {
				stage: AcquisitionStage.QUALIFIED,
				fit: AcquisitionFit.WEAK,
				summary: "Dossier A remains the last complete acquisition assessment.",
				strengths: dossierAStrengths,
				concerns: dossierAConcerns,
				criteria: dossierACriteria,
				missingInformation: ["Prior revenue gap"],
				recommendedAction: "Keep the prior dossier unchanged.",
				recommendedStage: AcquisitionStage.WATCHLIST,
				sourceUrls: ["https://prior.example.test/dossier"],
				researchedAt: timestampA,
				sourceSessionId: "dossier-a-session",
			},
			company: { lastActivityAt: timestampA },
			activityCount: 0,
		});
	});
});
