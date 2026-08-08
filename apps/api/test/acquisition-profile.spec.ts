import { describe, expect, it } from "bun:test";
import {
	AcquisitionAssetPreference,
	AcquisitionOwnerInvolvement,
	AcquisitionRevenuePreference,
	type Prisma,
	WorkspaceMode,
} from "@crm/db";
import {
	myTasksInput,
	taskCountsInput,
} from "../src/activities/activities.contracts";
import { taskDayWindow } from "../src/activities/task-window";
import {
	visibleCriteriaCount,
	visibleFitWhere,
} from "../src/dashboard/acquisition-summary";
import {
	setWorkspaceModeInput,
	updateAcquisitionProfileInput,
} from "../src/workspace/workspace.contracts";

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

describe("visible buy-box matching", () => {
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
		createdAt: new Date("2026-08-08T00:00:00.000Z"),
		updatedAt: new Date("2026-08-08T00:00:00.000Z"),
	} satisfies Prisma.AcquisitionProfileGetPayload<object>;

	it("counts only criteria represented on company records", () => {
		expect(visibleCriteriaCount(profile)).toBe(3);
	});

	it("builds a deterministic industry and geography filter", () => {
		expect(visibleFitWhere(profile, { ownerId: "viewer" })).toEqual({
			AND: [
				{ ownerId: "viewer" },
				{
					OR: [
						{ industry: { contains: "HVAC", mode: "insensitive" } },
						{ subIndustry: { contains: "HVAC", mode: "insensitive" } },
					],
				},
				{
					OR: [
						{ city: { contains: "TX", mode: "insensitive" } },
						{ stateCode: { contains: "TX", mode: "insensitive" } },
						{ country: { contains: "TX", mode: "insensitive" } },
						{ countryCode: { contains: "TX", mode: "insensitive" } },
					],
				},
				{
					NOT: {
						OR: [
							{
								industry: { contains: "Restaurants", mode: "insensitive" },
							},
							{
								subIndustry: {
									contains: "Restaurants",
									mode: "insensitive",
								},
							},
						],
					},
				},
			],
		});
	});

	it("does not claim a match before visible criteria exist", () => {
		expect(visibleFitWhere(null, {})).toBeNull();
	});
});
