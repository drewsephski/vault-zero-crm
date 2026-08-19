import { AcquisitionFit, AcquisitionStage } from "./generated/prisma/enums";

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

export const TARGET_LIFECYCLE_STAGES = [
	AcquisitionStage.DISCOVERED,
	AcquisitionStage.QUALIFIED,
	AcquisitionStage.WATCHLIST,
	AcquisitionStage.REJECTED,
	AcquisitionStage.ACQUIRED,
] as const;

export type TargetLifecycleStage = (typeof TARGET_LIFECYCLE_STAGES)[number];

const TARGET_LIFECYCLE_STAGE_SET = new Set<AcquisitionStage>(
	TARGET_LIFECYCLE_STAGES,
);

export function isTargetLifecycleStage(stage: AcquisitionStage): boolean {
	return TARGET_LIFECYCLE_STAGE_SET.has(stage);
}

export const ACTIVE_ACQUISITION_STAGES = [
	AcquisitionStage.DISCOVERED,
	AcquisitionStage.QUALIFIED,
	AcquisitionStage.WATCHLIST,
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

export function isAcquisitionEvidenceUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

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

export function isDiscoveryReady(profile: AcquisitionFocus): boolean {
	return (
		profile.preferredIndustries.length > 0 || profile.geographies.length > 0
	);
}

export function isDossierReady(profile: AcquisitionCriteriaProfile): boolean {
	return expectedAcquisitionCriterionIds(profile).length > 0;
}

export function configuredCriteriaCount(
	profile: AcquisitionCriteriaProfile,
): number {
	return expectedAcquisitionCriterionIds(profile).length;
}

export function hasAcquisitionFocus(profile: AcquisitionFocus): boolean {
	return isDiscoveryReady(profile);
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

const FIT_ATTENTION_WEIGHT: Record<AcquisitionFit, number> = {
	STRONG: 300,
	POTENTIAL: 200,
	UNKNOWN: 100,
	WEAK: 0,
	DISQUALIFIED: 0,
};

export function acquisitionAttentionScore(input: {
	fit: AcquisitionFit;
	criteria: AcquisitionCriterionAssessment[] | null | undefined;
	researchedAt: Date | null;
	staleBefore: Date;
	openTaskCount: number;
	hasActiveEngagement: boolean;
}): number {
	let score = FIT_ATTENTION_WEIGHT[input.fit] ?? 0;
	const criteria = input.criteria ?? [];
	if (
		criteria.some(
			(criterion) =>
				criterion.blocksQualification && criterion.result === "UNKNOWN",
		)
	) {
		score += 80;
	}
	if (!input.researchedAt) score += 60;
	else if (input.researchedAt < input.staleBefore) score += 40;
	if (input.openTaskCount === 0) score += 30;
	if (input.hasActiveEngagement) score += 20;
	return score;
}
