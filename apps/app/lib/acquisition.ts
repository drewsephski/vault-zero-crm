import {
	type AcquisitionCriterionAssessment,
	isAcquisitionEvidenceUrl,
	isDossierReady,
} from "@crm/db/acquisition";
import type { StatusTone } from "@crm/ui/components/status-indicator";

const ACQUISITION_CRITERION_LABELS: Record<
	AcquisitionCriterionAssessment["id"],
	string
> = {
	industry: "Industry",
	geography: "Geography",
	"excluded-categories": "Excluded categories",
	revenue: "Annual revenue",
	ebitda: "EBITDA or SDE",
	"purchase-price": "Purchase price",
	"owner-involvement": "Owner involvement",
	"recurring-revenue": "Recurring revenue",
	"customer-concentration": "Maximum customer concentration",
	"asset-profile": "Asset profile",
	financing: "Financing assumptions",
};

export function acquisitionCriterionLabel(
	id: AcquisitionCriterionAssessment["id"],
): string {
	return ACQUISITION_CRITERION_LABELS[id];
}

export function safeAcquisitionEvidence<
	TEvidence extends { label: string; url: string },
>(evidence: readonly TEvidence[]): TEvidence[] {
	return evidence.filter((source) => isAcquisitionEvidenceUrl(source.url));
}

export function safeAcquisitionCandidateSource(
	sourceUrl: string,
): string | null {
	return isAcquisitionEvidenceUrl(sourceUrl) ? sourceUrl : null;
}

type AcquisitionTargetCreateFields = {
	name: string;
	domain?: string;
	ownerId?: string | null;
};

export function acquisitionTargetCreateSubmission(
	fields: AcquisitionTargetCreateFields,
	idempotencyKey: string,
): AcquisitionTargetCreateFields & { idempotencyKey: string } {
	return { ...fields, idempotencyKey };
}

type CompanyTargetState =
	| { acquisitionTarget?: unknown | null }
	| null
	| undefined;

export function defaultCompanyTab(
	company: CompanyTargetState,
	acquisitionMode: boolean,
): "overview" | "acquisition" {
	return acquisitionMode && company?.acquisitionTarget
		? "acquisition"
		: "overview";
}

export function criterionGroups<T extends AcquisitionCriterionAssessment>(
	criteria: readonly T[],
): { blockers: T[]; assessments: T[]; unknowns: T[] } {
	const blockers: T[] = [];
	const assessments: T[] = [];
	const unknowns: T[] = [];

	for (const criterion of criteria) {
		if (criterion.blocksQualification) {
			blockers.push(criterion);
		} else if (criterion.result === "UNKNOWN") {
			unknowns.push(criterion);
		} else {
			assessments.push(criterion);
		}
	}

	return { blockers, assessments, unknowns };
}

export type AcquisitionProfileDossierFields = {
	preferredIndustries: readonly string[];
	geographies: readonly string[];
	excludedCategories: readonly string[];
	revenueMinCents: number | null;
	revenueMaxCents: number | null;
	ebitdaMinCents: number | null;
	ebitdaMaxCents: number | null;
	purchasePriceMinCents: number | null;
	purchasePriceMaxCents: number | null;
	ownerInvolvement: unknown | null;
	recurringRevenuePreference: unknown | null;
	customerConcentrationMax: number | null;
	assetPreference: unknown | null;
	financingAssumptions: string | null;
};

export function acquisitionProfileDossierReady(
	profile: AcquisitionProfileDossierFields,
): boolean {
	return isDossierReady({
		preferredIndustries: profile.preferredIndustries,
		geographies: profile.geographies,
		excludedCategories: profile.excludedCategories,
		revenueMin: profile.revenueMinCents,
		revenueMax: profile.revenueMaxCents,
		ebitdaMin: profile.ebitdaMinCents,
		ebitdaMax: profile.ebitdaMaxCents,
		purchasePriceMin: profile.purchasePriceMinCents,
		purchasePriceMax: profile.purchasePriceMaxCents,
		ownerInvolvement: profile.ownerInvolvement,
		recurringRevenuePreference: profile.recurringRevenuePreference,
		customerConcentrationMax: profile.customerConcentrationMax,
		assetPreference: profile.assetPreference,
		financingAssumptions: profile.financingAssumptions,
	});
}

export type TargetResearchState =
	| {
			status: "idle" | "queued" | "running" | "retrying";
			error?: string | null;
	  }
	| {
			status: "failed";
			error?: string | null;
			blocker?: "queue-unavailable";
	  }
	| {
			status: "blocked";
			blocker: "missing-domain" | "missing-buy-box";
	  };

export type TargetResearchAction = {
	kind: "domain" | "buy-box" | "retry";
	label: string;
};

export type TargetResearchPresentation = {
	label: string;
	description: string;
	tone: StatusTone;
	busy: boolean;
	pulse: boolean;
	action: TargetResearchAction | null;
	feedback: { kind: "success" | "error"; message: string } | null;
};

export function acquisitionResearchActivity(
	state: TargetResearchState,
): "queued" | "running" | null {
	if (state.status === "queued") return "queued";
	if (state.status === "running" || state.status === "retrying") return "running";
	return null;
}

export function targetResearchCopy(
	state: TargetResearchState,
): TargetResearchPresentation {
	if (state.status === "queued") {
		return {
			label: "Research queued",
			description:
				"Eve will start shortly. This page updates automatically when research begins.",
			tone: "info",
			busy: true,
			pulse: true,
			action: null,
			feedback: { kind: "success", message: "Target added. Research queued." },
		};
	}

	if (state.status === "running") {
		return {
			label: "Research in progress",
			description:
				"Eve is comparing this target with your buy box and writing the dossier. Updates appear here automatically.",
			tone: "info",
			busy: true,
			pulse: false,
			action: null,
			feedback: null,
		};
	}

	if (state.status === "retrying") {
		return {
			label: "Research retrying",
			description:
				"Eve hit a temporary issue and will retry shortly. This page updates automatically.",
			tone: "warning",
			busy: true,
			pulse: true,
			action: null,
			feedback: null,
		};
	}

	if (state.status === "failed") {
		return {
			label: "Research failed",
			description:
				"Unable to complete this research pass. This dossier stays available for review.",
			tone: "error",
			busy: false,
			pulse: false,
			action: { kind: "retry", label: "Retry research" },
			feedback: state.blocker
				? {
						kind: "error",
						message: "Target added. Unable to queue research. Try again.",
					}
				: null,
		};
	}

	if (state.status === "blocked") {
		const domain = state.blocker === "missing-domain";
		return {
			label: "Research blocked",
			description: domain
				? "Add a domain before starting acquisition research."
				: "Complete the buy box before starting acquisition research.",
			tone: "warning",
			busy: false,
			pulse: false,
			action: domain
				? { kind: "domain", label: "Add a domain" }
				: { kind: "buy-box", label: "Complete the buy box" },
			feedback: {
				kind: "error",
				message: domain
					? "Target added. Add a domain to start research."
					: "Target added. Complete the buy box to start research.",
			},
		};
	}

	return {
		label: "No research in progress",
		description: "No acquisition research is queued or running.",
		tone: "neutral",
		busy: false,
		pulse: false,
		action: null,
		feedback: null,
	};
}
