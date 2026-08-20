import { describe, expect, it } from "bun:test";
import {
	AcquisitionAssetPreference,
	AcquisitionOwnerInvolvement,
	AcquisitionRevenuePreference,
	AcquisitionStage,
	type Prisma,
	WorkspaceMode,
} from "@crm/db";
import {
	ACTIVE_ACQUISITION_STAGES,
	TARGET_LIFECYCLE_STAGES,
} from "@crm/db/acquisition";
import { runInOrganization } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	acquisitionCandidateIdInput,
	createAcquisitionTargetInput,
	updateAcquisitionTargetInput,
} from "../src/acquisition/acquisition.contracts";
import {
	acquisitionTargetWhere,
	companyTargetWhere,
} from "../src/acquisition/acquisition-where";
import {
	myTasksInput,
	taskCountsInput,
} from "../src/activities/activities.contracts";
import { taskDayWindow } from "../src/activities/task-window";
import { visibleCriteriaCount } from "../src/dashboard/acquisition-summary";
import {
	setWorkspaceModeInput,
	updateAcquisitionProfileInput,
} from "../src/workspace/workspace.contracts";
import { hasDiscoveryFocus } from "../src/workspace/workspace.service";

const validProfile = {
	preferredIndustries: ["HVAC"],
	geographies: ["Texas"],
	excludedCategories: ["Restaurants"],
	currency: "USD",
	revenueMinCents: 100_000_000,
	revenueMaxCents: 500_000_000,
	ebitdaMinCents: 20_000_000,
	ebitdaMaxCents: 100_000_000,
	purchasePriceMinCents: 200_000_000,
	purchasePriceMaxCents: 700_000_000,
	ownerInvolvement: AcquisitionOwnerInvolvement.TRANSITIONAL,
	recurringRevenuePreference: AcquisitionRevenuePreference.PREFERRED,
	customerConcentrationMax: 20,
	assetPreference: AcquisitionAssetPreference.ASSET_LIGHT,
	financingAssumptions: "SBA with a seller note.",
};

describe("acquisition profile contracts", () => {
	it("accepts the two workspace modes", () => {
		expect(
			setWorkspaceModeInput.parse({ mode: WorkspaceMode.ACQUISITION }),
		).toEqual({ mode: WorkspaceMode.ACQUISITION });
		expect(setWorkspaceModeInput.parse({ mode: WorkspaceMode.SALES })).toEqual({
			mode: WorkspaceMode.SALES,
		});
	});

	it("keeps the buy box structured", () => {
		expect(updateAcquisitionProfileInput.parse(validProfile)).toEqual(
			validProfile,
		);
	});

	it("rejects inverted financial ranges", () => {
		const result = updateAcquisitionProfileInput.safeParse({
			...validProfile,
			revenueMinCents: 600_000_000,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["revenueMaxCents"]);
		}
	});

	it("rejects currencies outside the supported reporting set", () => {
		expect(
			updateAcquisitionProfileInput.safeParse({
				...validProfile,
				currency: "ZZZ",
			}).success,
		).toBe(false);
	});

	it("requires an industry or geography before discovery starts", () => {
		expect(
			hasDiscoveryFocus({ preferredIndustries: [], geographies: [] }),
		).toBe(false);
		expect(
			hasDiscoveryFocus({ preferredIndustries: ["HVAC"], geographies: [] }),
		).toBe(true);
	});
});

describe("acquisition operating contracts", () => {
	it("builds the canonical active company target scope", () => {
		const scope = runInOrganization(WORKSPACE_ID, () =>
			companyTargetWhere("active", { ownerId: "viewer" }),
		);
		expect(scope).toEqual({
			AND: [
				{ ownerId: "viewer", organizationId: WORKSPACE_ID },
				{
					acquisitionTarget: {
						is: { stage: { in: [...ACTIVE_ACQUISITION_STAGES] } },
					},
				},
			],
		});
	});

	it("builds the canonical rejected target scope through company ownership", () => {
		const scope = runInOrganization(WORKSPACE_ID, () =>
			acquisitionTargetWhere("rejected", { ownerId: "viewer" }),
		);
		expect(scope).toEqual({
			stage: AcquisitionStage.REJECTED,
			company: { is: { ownerId: "viewer", organizationId: WORKSPACE_ID } },
		});
	});

	it("accepts a candidate review decision", () => {
		expect(acquisitionCandidateIdInput.parse({ id: "candidate-1" })).toEqual({
			id: "candidate-1",
		});
	});

	it("requires a UUID idempotency key for manual target creation", () => {
		const input = {
			name: "Atlas Services",
			idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
		};

		expect(createAcquisitionTargetInput.parse(input)).toEqual(input);
		expect(
			createAcquisitionTargetInput.safeParse({ name: "Atlas Services" })
				.success,
		).toBe(false);
		expect(
			createAcquisitionTargetInput.safeParse({
				name: "Atlas Services",
				idempotencyKey: "retry-me",
			}).success,
		).toBe(false);
	});

	it("accepts every supported target lifecycle stage", () => {
		for (const stage of TARGET_LIFECYCLE_STAGES) {
			expect(
				updateAcquisitionTargetInput.safeParse({
					companyId: "company-1",
					stage,
				}).success,
			).toBe(true);
		}
	});

	it("rejects legacy transaction lifecycle stages on targets", () => {
		for (const stage of [
			"RESEARCHING",
			"CONTACTED",
			"INTERESTED",
			"OPPORTUNITY",
			"DILIGENCE",
		]) {
			expect(
				updateAcquisitionTargetInput.safeParse({
					companyId: "company-1",
					stage,
				}).success,
			).toBe(false);
		}
	});

	it("rejects an invented lifecycle stage", () => {
		expect(
			updateAcquisitionTargetInput.safeParse({
				companyId: "company-1",
				stage: "AUTO_QUALIFIED",
			}).success,
		).toBe(false);
	});
});

describe("task window contracts", () => {
	it("defaults to today in UTC", () => {
		expect(myTasksInput.parse({})).toEqual({
			window: "today",
			limit: 25,
			timezoneOffset: 0,
		});
		expect(taskCountsInput.parse({})).toEqual({ timezoneOffset: 0 });
	});

	it("bounds browser timezone offsets", () => {
		expect(myTasksInput.safeParse({ timezoneOffset: 900 }).success).toBe(false);
		expect(myTasksInput.safeParse({ timezoneOffset: -840 }).success).toBe(true);
	});

	it("uses the browser offset to find local midnight", () => {
		const window = taskDayWindow(new Date("2026-08-08T18:00:00.000Z"), 300);

		expect(window.start.toISOString()).toBe("2026-08-08T05:00:00.000Z");
		expect(window.end.toISOString()).toBe("2026-08-09T05:00:00.000Z");
	});
});

describe("visible buy-box criteria", () => {
	const profile = {
		id: "workspace",
		mode: WorkspaceMode.ACQUISITION,
		preferredIndustries: ["HVAC"],
		geographies: ["TX"],
		excludedCategories: ["Restaurants"],
		currency: "USD",
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
		buyBoxRevision: 0,
		criterionWeights: null,
		createdAt: new Date("2026-08-08T00:00:00.000Z"),
		updatedAt: new Date("2026-08-08T00:00:00.000Z"),
	} satisfies Prisma.AcquisitionProfileGetPayload<object>;

	it("counts every configured buy-box criterion", () => {
		expect(visibleCriteriaCount(profile)).toBe(3);
	});
});
