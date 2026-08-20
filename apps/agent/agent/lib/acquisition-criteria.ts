import {
	ACQUISITION_CRITERION_IDS,
	ACQUISITION_CRITERION_RESULTS,
	type AcquisitionCriterionAssessment,
	type AcquisitionCriterionId,
	isAcquisitionEvidenceUrl,
} from "@crm/db/acquisition";
import { z } from "zod";

const criterionEvidenceSchema = z.object({
	label: z.string().trim().min(5).max(300),
	url: z.url().refine(isAcquisitionEvidenceUrl),
});

export const acquisitionCriterionAssessmentSchema = z
	.object({
		id: z.enum(ACQUISITION_CRITERION_IDS),
		result: z.enum(ACQUISITION_CRITERION_RESULTS),
		explanation: z.string().trim().min(5).max(400),
		blocksQualification: z.boolean(),
		evidence: z.array(criterionEvidenceSchema).max(5),
	})
	.superRefine((assessment, ctx) => {
		if (assessment.result !== "UNKNOWN" && assessment.evidence.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["evidence"],
				message: `${assessment.result} requires evidence`,
			});
		}

		if (assessment.blocksQualification && assessment.result !== "UNKNOWN") {
			ctx.addIssue({
				code: "custom",
				path: ["blocksQualification"],
				message: "Only UNKNOWN criteria may block qualification",
			});
		}
	});

export const acquisitionCriteriaSchema = z
	.array(acquisitionCriterionAssessmentSchema)
	.max(ACQUISITION_CRITERION_IDS.length);

export function validateCriterionAssessments(
	expectedIds: readonly AcquisitionCriterionId[],
	assessments: readonly AcquisitionCriterionAssessment[],
):
	| { ok: true; criteria: AcquisitionCriterionAssessment[] }
	| { ok: false; reason: string } {
	const receivedIds = assessments.map((assessment) => assessment.id);
	const assessmentsById = new Map(
		assessments.map((assessment) => [assessment.id, assessment]),
	);
	const matches =
		expectedIds.length === receivedIds.length &&
		assessmentsById.size === receivedIds.length &&
		expectedIds.every((id) => assessmentsById.has(id));

	if (matches) {
		return {
			ok: true,
			criteria: expectedIds.flatMap((id) => {
				const assessment = assessmentsById.get(id);
				return assessment ? [assessment] : [];
			}),
		};
	}

	return {
		ok: false,
		reason: `Criterion identity mismatch. Expected [${expectedIds.join(", ")}] but received [${receivedIds.join(", ")}].`,
	};
}
