import { describe, expect, it } from "bun:test";
import { acquisitionProfileChanged } from "../src/acquisition-profile-revision";
import { Prisma } from "../src/generated/prisma/client";

const profile = {
	preferredIndustries: ["Home Services", "HVAC"],
	geographies: ["Texas"],
	excludedCategories: ["Restaurants"],
	currency: "USD",
	revenueMin: new Prisma.Decimal(1_000_000),
	revenueMax: null,
	ebitdaMin: null,
	ebitdaMax: null,
	purchasePriceMin: null,
	purchasePriceMax: new Prisma.Decimal(5_000_000),
	ownerInvolvement: null,
	recurringRevenuePreference: null,
	customerConcentrationMax: 20,
	assetPreference: null,
	financingAssumptions: "SBA preferred",
};

describe("acquisition profile revision", () => {
	it("ignores ordering, casing, and whitespace in list criteria", () => {
		expect(
			acquisitionProfileChanged(profile, {
				...profile,
				preferredIndustries: [" hvac ", "HOME SERVICES"],
			}),
		).toBe(false);
	});

	it("detects a semantic criterion change", () => {
		expect(
			acquisitionProfileChanged(profile, {
				...profile,
				customerConcentrationMax: 15,
			}),
		).toBe(true);
	});
});
