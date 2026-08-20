import {
	ACQUISITION_CRITERION_IDS,
	ACQUISITION_CRITERION_RESULTS,
	type AcquisitionCriterionAssessment,
} from "./acquisition";
import { AcquisitionFit, AcquisitionStage } from "./generated/prisma/enums";

export type AcquisitionDossierSnapshot = {
	fit: AcquisitionFit;
	summary: string;
	criteria: AcquisitionCriterionAssessment[];
	strengths: { summary: string; evidence: { label: string; url: string }[] }[];
	concerns: { summary: string; evidence: { label: string; url: string }[] }[];
	missingInformation: string[];
	recommendedAction: string;
	recommendedStage: AcquisitionStage | null;
	sourceUrls: string[];
	researchedAt: string;
	sourceSessionId: string;
};

export function researchRunListSnapshot(snapshot: unknown): {
	fit: AcquisitionFit | null;
	summary: string | null;
} {
	const parsed = parseAcquisitionDossierSnapshot(snapshot);
	return parsed
		? { fit: parsed.fit, summary: parsed.summary.slice(0, 240) }
		: { fit: null, summary: null };
}

const acquisitionFits = new Set<unknown>(Object.values(AcquisitionFit));
const acquisitionStages = new Set<unknown>(Object.values(AcquisitionStage));
const criterionIds = new Set<unknown>(ACQUISITION_CRITERION_IDS);
const criterionResults = new Set<unknown>(ACQUISITION_CRITERION_RESULTS);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function isEvidence(value: unknown): value is { label: string; url: string } {
	return (
		isRecord(value) &&
		typeof value.label === "string" &&
		typeof value.url === "string"
	);
}

function isFinding(
	value: unknown,
): value is AcquisitionDossierSnapshot["strengths"][number] {
	return (
		isRecord(value) &&
		typeof value.summary === "string" &&
		Array.isArray(value.evidence) &&
		value.evidence.every(isEvidence)
	);
}

function isCriterion(value: unknown): value is AcquisitionCriterionAssessment {
	return (
		isRecord(value) &&
		criterionIds.has(value.id) &&
		criterionResults.has(value.result) &&
		typeof value.explanation === "string" &&
		typeof value.blocksQualification === "boolean" &&
		Array.isArray(value.evidence) &&
		value.evidence.every(isEvidence)
	);
}

export function parseAcquisitionDossierSnapshot(
	value: unknown,
): AcquisitionDossierSnapshot | null {
	if (!isRecord(value)) return null;

	const record = value;
	if (
		!acquisitionFits.has(record.fit) ||
		typeof record.summary !== "string" ||
		typeof record.recommendedAction !== "string" ||
		typeof record.researchedAt !== "string" ||
		typeof record.sourceSessionId !== "string" ||
		!Array.isArray(record.criteria) ||
		!record.criteria.every(isCriterion) ||
		!Array.isArray(record.strengths) ||
		!record.strengths.every(isFinding) ||
		!Array.isArray(record.concerns) ||
		!record.concerns.every(isFinding) ||
		!isStringArray(record.missingInformation) ||
		!isStringArray(record.sourceUrls) ||
		(record.recommendedStage !== undefined &&
			record.recommendedStage !== null &&
			!acquisitionStages.has(record.recommendedStage))
	) {
		return null;
	}

	return {
		fit: record.fit as AcquisitionFit,
		summary: record.summary,
		criteria: record.criteria,
		strengths: record.strengths,
		concerns: record.concerns,
		missingInformation: record.missingInformation,
		recommendedAction: record.recommendedAction,
		recommendedStage:
			record.recommendedStage === null || record.recommendedStage === undefined
				? null
				: (record.recommendedStage as AcquisitionStage),
		sourceUrls: record.sourceUrls,
		researchedAt: record.researchedAt,
		sourceSessionId: record.sourceSessionId,
	};
}
