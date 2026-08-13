import { describe, expect, it } from "bun:test";
import {
	appendListValues,
	type BuyBoxDraft,
	listValues,
	moneyCents,
	validateBuyBoxDraft,
} from "../app/(app)/[slug]/settings/buy-box/buy-box-values";

const draft = {
	preferredIndustries: "HVAC",
	geographies: "Texas",
	excludedCategories: "Restaurants",
	currency: "USD",
	revenueMin: "1000000",
	revenueMax: "5000000",
	ebitdaMin: "",
	ebitdaMax: "",
	purchasePriceMin: "",
	purchasePriceMax: "",
	ownerInvolvement: null,
	recurringRevenuePreference: null,
	customerConcentrationMax: "20",
	assetPreference: null,
	financingAssumptions: "SBA with a seller note.",
} satisfies BuyBoxDraft;

describe("buy box values", () => {
	it("parses selected values and appends distinct custom entries", () => {
		expect(listValues("HVAC, Commercial services\nManufacturing")).toEqual([
			"HVAC",
			"Commercial services",
			"Manufacturing",
		]);
		expect(
			appendListValues("HVAC, Commercial services", "hvac, Plumbing"),
		).toBe("HVAC, Commercial services, Plumbing");
	});

	it("converts valid amounts to safe integer cents", () => {
		expect(moneyCents("1234.56")).toBe(123_456);
		expect(moneyCents("")).toBeNull();
		expect(moneyCents("not money")).toBeNull();
		expect(moneyCents(String(Number.MAX_SAFE_INTEGER))).toBeNull();
	});

	it("reports invalid values instead of silently clearing them", () => {
		expect(
			validateBuyBoxDraft({
				...draft,
				revenueMin: "not money",
				customerConcentrationMax: "20.5",
			}),
		).toMatchObject({
			revenueMin: "Revenue minimum must be a valid non-negative amount.",
			customerConcentrationMax: "Enter a whole percentage from 0 to 100.",
		});
	});

	it("ties inverted ranges to the maximum field", () => {
		expect(
			validateBuyBoxDraft({
				...draft,
				revenueMin: "6000000",
			}),
		).toMatchObject({
			revenueMax: "The maximum must be at least the minimum.",
		});
	});

	it("enforces the server list limits before submission", () => {
		expect(
			validateBuyBoxDraft({
				...draft,
				preferredIndustries: Array.from(
					{ length: 26 },
					(_, index) => `Industry ${index}`,
				).join(", "),
			}),
		).toMatchObject({
			preferredIndustries: "Preferred industries can include up to 25 items.",
		});
	});
});
