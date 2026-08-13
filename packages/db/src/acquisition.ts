import { AcquisitionStage } from "./generated/prisma/enums";

export const ACQUISITION_CRITERION_IDS = [
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
] as const;

export const ACQUISITION_CRITERION_RESULTS = [
	"MATCH",
	"PARTIAL",
	"CONCERN",
	"UNKNOWN",
] as const;

export const ACQUISITION_TASK_KINDS = [
	"acquisition-discovery",
	"acquisition-refresh",
] as const;

export const ACQUISITION_TASK_INTERVAL_MS = {
	"acquisition-discovery": 7 * 24 * 60 * 60 * 1000,
	"acquisition-refresh": 30 * 24 * 60 * 60 * 1000,
} as const;

export const ACTIVE_ACQUISITION_STAGES = [
	AcquisitionStage.DISCOVERED,
	AcquisitionStage.RESEARCHING,
	AcquisitionStage.QUALIFIED,
	AcquisitionStage.WATCHLIST,
	AcquisitionStage.CONTACTED,
	AcquisitionStage.INTERESTED,
	AcquisitionStage.OPPORTUNITY,
	AcquisitionStage.DILIGENCE,
] as const;

export type AcquisitionCriterionId = (typeof ACQUISITION_CRITERION_IDS)[number];
export type AcquisitionCriterionResult =
	(typeof ACQUISITION_CRITERION_RESULTS)[number];
export type AcquisitionTargetView =
	| "active"
	| "rejected"
	| "acquired"
	| "history";

export type AcquisitionCriterionAssessment = {
	id: AcquisitionCriterionId;
	result: AcquisitionCriterionResult;
	explanation: string;
	blocksQualification: boolean;
	evidence: { label: string; url: string }[];
};

type AcquisitionFocus = {
	preferredIndustries: readonly string[];
	geographies: readonly string[];
};

type AcquisitionCriteriaProfile = AcquisitionFocus & {
	excludedCategories: readonly string[];
	revenueMin: unknown | null;
	revenueMax: unknown | null;
	ebitdaMin: unknown | null;
	ebitdaMax: unknown | null;
	purchasePriceMin: unknown | null;
	purchasePriceMax: unknown | null;
	ownerInvolvement: unknown | null;
	recurringRevenuePreference: unknown | null;
	customerConcentrationMax: number | null;
	assetPreference: unknown | null;
	financingAssumptions: string | null;
};

export function hasAcquisitionFocus(profile: AcquisitionFocus): boolean {
	return (
		profile.preferredIndustries.length > 0 || profile.geographies.length > 0
	);
}

export function expectedAcquisitionCriterionIds(
	profile: AcquisitionCriteriaProfile,
): AcquisitionCriterionId[] {
	return ACQUISITION_CRITERION_IDS.filter((id) => {
		if (id === "industry") return profile.preferredIndustries.length > 0;
		if (id === "geography") return profile.geographies.length > 0;
		if (id === "excluded-categories") {
			return profile.excludedCategories.length > 0;
		}
		if (id === "revenue") {
			return profile.revenueMin !== null || profile.revenueMax !== null;
		}
		if (id === "ebitda") {
			return profile.ebitdaMin !== null || profile.ebitdaMax !== null;
		}
		if (id === "purchase-price") {
			return (
				profile.purchasePriceMin !== null || profile.purchasePriceMax !== null
			);
		}
		if (id === "owner-involvement") return profile.ownerInvolvement !== null;
		if (id === "recurring-revenue") {
			return profile.recurringRevenuePreference !== null;
		}
		if (id === "customer-concentration") {
			return profile.customerConcentrationMax !== null;
		}
		if (id === "asset-profile") return profile.assetPreference !== null;
		return Boolean(profile.financingAssumptions?.trim());
	});
}

export function targetStages(
	view: AcquisitionTargetView,
): readonly AcquisitionStage[] | null {
	if (view === "active") return ACTIVE_ACQUISITION_STAGES;
	if (view === "rejected") return [AcquisitionStage.REJECTED];
	if (view === "acquired") return [AcquisitionStage.ACQUIRED];
	return null;
}
