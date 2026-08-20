import type { AcquisitionCriterionAssessment } from "./acquisition";
import type {
	AcquisitionFit,
	AcquisitionStage,
} from "./generated/prisma/enums";

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
	if (!snapshot || typeof snapshot !== "object") {
		return { fit: null, summary: null };
	}

	const record = snapshot as Record<string, unknown>;
	const fit =
		typeof record.fit === "string" ? (record.fit as AcquisitionFit) : null;
	const summary =
		typeof record.summary === "string" ? record.summary.slice(0, 240) : null;

	return { fit, summary };
}

export function parseAcquisitionDossierSnapshot(
	value: unknown,
): AcquisitionDossierSnapshot | null {
	if (!value || typeof value !== "object") return null;

	const record = value as Record<string, unknown>;
	if (
		typeof record.fit !== "string" ||
		typeof record.summary !== "string" ||
		typeof record.recommendedAction !== "string" ||
		typeof record.researchedAt !== "string" ||
		typeof record.sourceSessionId !== "string" ||
		!Array.isArray(record.criteria) ||
		!Array.isArray(record.strengths) ||
		!Array.isArray(record.concerns) ||
		!Array.isArray(record.missingInformation) ||
		!Array.isArray(record.sourceUrls)
	) {
		return null;
	}

	return {
		fit: record.fit as AcquisitionFit,
		summary: record.summary,
		criteria: record.criteria as AcquisitionCriterionAssessment[],
		strengths: record.strengths as AcquisitionDossierSnapshot["strengths"],
		concerns: record.concerns as AcquisitionDossierSnapshot["concerns"],
		missingInformation: record.missingInformation as string[],
		recommendedAction: record.recommendedAction,
		recommendedStage:
			record.recommendedStage === null
				? null
				: (record.recommendedStage as AcquisitionStage),
		sourceUrls: record.sourceUrls as string[],
		researchedAt: record.researchedAt,
		sourceSessionId: record.sourceSessionId,
	};
}
