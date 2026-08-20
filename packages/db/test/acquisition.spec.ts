import { describe, expect, it } from "bun:test";
import {
	configuredCriteriaCount,
	expectedAcquisitionCriterionIds,
	isDiscoveryReady,
	isDossierReady,
	isTargetLifecycleStage,
	acquisitionAttentionScore,
	TARGET_LIFECYCLE_STAGES,
	targetStages,
} from "../src/acquisition";
import { AcquisitionFit, AcquisitionStage } from "@crm/db/enums";

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

	it("requires an industry or geography for discovery", () => {
		expect(
			isDiscoveryReady({ preferredIndustries: [], geographies: [] }),
		).toBe(false);
		expect(
			isDiscoveryReady({
				preferredIndustries: ["HVAC"],
				geographies: [],
			}),
		).toBe(true);
	});

	it("allows dossier readiness from financial criteria alone", () => {
		expect(
			isDossierReady({
				preferredIndustries: [],
				geographies: [],
				excludedCategories: [],
				revenueMin: 1,
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
		).toBe(true);
		expect(
			isDiscoveryReady({
				preferredIndustries: [],
				geographies: [],
			}),
		).toBe(false);
	});

	it("counts configured buy-box criteria for dashboard metrics", () => {
		expect(configuredCriteriaCount(profile)).toBe(11);
		expect(
			configuredCriteriaCount({
				preferredIndustries: ["HVAC"],
				geographies: ["TX"],
				excludedCategories: ["Restaurants"],
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
		).toBe(3);
	});

	it("defines active and historical lifecycle scopes once", () => {
		expect(targetStages("active")).not.toContain(AcquisitionStage.REJECTED);
		expect(targetStages("active")).not.toContain(AcquisitionStage.ACQUIRED);
		expect(targetStages("rejected")).toEqual([AcquisitionStage.REJECTED]);
		expect(targetStages("acquired")).toEqual([AcquisitionStage.ACQUIRED]);
		expect(targetStages("history")).toBeNull();
	});

	it("defines supported target lifecycle stages", () => {
		expect(TARGET_LIFECYCLE_STAGES).toEqual([
			AcquisitionStage.DISCOVERED,
			AcquisitionStage.QUALIFIED,
			AcquisitionStage.WATCHLIST,
			AcquisitionStage.REJECTED,
			AcquisitionStage.ACQUIRED,
		]);
		expect(isTargetLifecycleStage(AcquisitionStage.QUALIFIED)).toBe(true);
		expect(isTargetLifecycleStage(AcquisitionStage.DISCOVERED)).toBe(true);
	});

	it("scores attention from fit, blockers, staleness, tasks, and engagement", () => {
		const staleBefore = new Date("2026-01-01T00:00:00.000Z");
		expect(
			acquisitionAttentionScore({
				fit: AcquisitionFit.STRONG,
				criteria: [
					{
						id: "revenue",
						result: "UNKNOWN",
						explanation: "Missing",
						blocksQualification: true,
						evidence: [],
					},
				],
				researchedAt: null,
				staleBefore,
				openTaskCount: 0,
				hasActiveEngagement: true,
			}),
		).toBe(490);
	});
});
