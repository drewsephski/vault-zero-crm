import { describe, expect, it } from "bun:test";
import { AcquisitionStage } from "@crm/db/enums";
import {
	expectedAcquisitionCriterionIds,
	hasAcquisitionFocus,
	targetStages,
} from "../src/acquisition";

const profile = {
	preferredIndustries: ["HVAC"],
	geographies: ["Illinois"],
	excludedCategories: ["New construction"],
	revenueMin: 1,
	revenueMax: null,
	ebitdaMin: 1,
	ebitdaMax: null,
	purchasePriceMin: 1,
	purchasePriceMax: null,
	ownerInvolvement: "TRANSITIONAL",
	recurringRevenuePreference: "PREFERRED",
	customerConcentrationMax: 20,
	assetPreference: "ASSET_LIGHT",
	financingAssumptions: "SBA with a seller note",
};

describe("acquisition domain", () => {
	it("derives criterion identity in canonical order", () => {
		expect(expectedAcquisitionCriterionIds(profile)).toEqual([
			"industry",
			"geography",
			"excluded-categories",
			"revenue",
			"ebitda",
			"purchase-price",
			"owner-involvement",
			"recurring-revenue",
			"customer-concentration",
			"asset-profile",
			"financing",
		]);
	});

	it("requires an industry or geography for acquisition research", () => {
		expect(
			hasAcquisitionFocus({ preferredIndustries: [], geographies: [] }),
		).toBe(false);
		expect(
			hasAcquisitionFocus({
				preferredIndustries: ["HVAC"],
				geographies: [],
			}),
		).toBe(true);
	});

	it("defines active and historical lifecycle scopes once", () => {
		expect(targetStages("active")).not.toContain(AcquisitionStage.REJECTED);
		expect(targetStages("active")).not.toContain(AcquisitionStage.ACQUIRED);
		expect(targetStages("rejected")).toEqual([AcquisitionStage.REJECTED]);
		expect(targetStages("acquired")).toEqual([AcquisitionStage.ACQUIRED]);
		expect(targetStages("history")).toBeNull();
	});
});
