import {
	AcquisitionFit,
	ActivityType,
	db,
	getOrganizationId,
	WorkspaceMode,
} from "@crm/db";
import {
	expectedAcquisitionCriterionIds,
	isAcquisitionEvidenceUrl,
	TARGET_LIFECYCLE_STAGES,
} from "@crm/db/acquisition";
import type { AcquisitionDossierSnapshot } from "@crm/db/acquisition-research-runs";
import { resolveAutomatedActivityAuthor } from "@crm/db/activity-author";
import { z } from "zod";
import {
	acquisitionCriteriaSchema,
	validateCriterionAssessments,
} from "../lib/acquisition-criteria";
import { succeedAcquisitionResearchRun } from "../lib/acquisition-research-run";
import { defineTool } from "../lib/tool";

const evidence = z.object({
	label: z.string().trim().min(5).max(300),
	url: z.url().refine(isAcquisitionEvidenceUrl),
});

const finding = z.object({
	summary: z.string().trim().min(5).max(400),
	evidence: z.array(evidence).min(1).max(5),
});

export default defineTool({
	description:
		"Write the structured acquisition dossier for a CRM company after research. Every strength and concern needs source evidence. Fit is a plain-language decision category, never a made-up confidence percentage. Missing information stays explicit, and the human-owned lifecycle stage is never changed.",
	inputSchema: z.object({
		companyId: z.string().min(1),
		criteria: acquisitionCriteriaSchema,
		fit: z.enum([
			AcquisitionFit.UNKNOWN,
			AcquisitionFit.STRONG,
			AcquisitionFit.POTENTIAL,
			AcquisitionFit.WEAK,
			AcquisitionFit.DISQUALIFIED,
		]),
		summary: z.string().trim().min(20).max(1200),
		strengths: z.array(finding).max(8),
		concerns: z.array(finding).max(8),
		missingInformation: z.array(z.string().trim().min(3).max(240)).max(12),
		recommendedAction: z.string().trim().min(5).max(500),
		recommendedStage: z.enum(TARGET_LIFECYCLE_STAGES).nullable(),
	}),
	async execute(input, ctx) {
		const [company, profile] = await Promise.all([
			db.company.findUnique({
				where: { id: input.companyId },
				select: {
					id: true,
					name: true,
					ownerId: true,
					acquisitionTarget: { select: { fit: true } },
				},
			}),
			db.acquisitionProfile.findUnique({
				where: { id: getOrganizationId() ?? "" },
				select: {
					mode: true,
					preferredIndustries: true,
					geographies: true,
					excludedCategories: true,
					revenueMin: true,
					revenueMax: true,
					ebitdaMin: true,
					ebitdaMax: true,
					purchasePriceMin: true,
					purchasePriceMax: true,
					ownerInvolvement: true,
					recurringRevenuePreference: true,
					customerConcentrationMax: true,
					assetPreference: true,
					financingAssumptions: true,
				},
			}),
		]);

		if (!company)
			return { written: false as const, reason: "No such company." };
		if (!company.acquisitionTarget) {
			return {
				written: false as const,
				reason:
					"This company is not an acquisition target. Add it to targets before writing a dossier.",
			};
		}
		if (profile?.mode !== WorkspaceMode.ACQUISITION) {
			return {
				written: false as const,
				reason: "Acquisition mode is not enabled for this workspace.",
			};
		}
		const criterionValidation = validateCriterionAssessments(
			expectedAcquisitionCriterionIds(profile),
			input.criteria,
		);
		if (!criterionValidation.ok) {
			return { written: false as const, reason: criterionValidation.reason };
		}
		const criteria = criterionValidation.criteria;

		const sourceUrls = [
			...new Set(
				[...input.strengths, ...input.concerns, ...criteria].flatMap((item) =>
					item.evidence.map((itemEvidence) => itemEvidence.url),
				),
			),
		];
		const authorId = await resolveAutomatedActivityAuthor(db, [
			company.ownerId,
		]);
		if (!authorId) {
			return { written: false as const, reason: "No user to attribute to." };
		}
		const researchedAt = new Date();
		const snapshot: AcquisitionDossierSnapshot = {
			fit: input.fit,
			summary: input.summary,
			criteria,
			strengths: input.strengths,
			concerns: input.concerns,
			missingInformation: input.missingInformation,
			recommendedAction: input.recommendedAction,
			recommendedStage: input.recommendedStage,
			sourceUrls,
			researchedAt: researchedAt.toISOString(),
			sourceSessionId: ctx.session.id,
		};

		const written = await db.$transaction(async (tx) => {
			const { count } = await tx.acquisitionTarget.updateMany({
				where: { companyId: company.id },
				data: {
					fit: input.fit,
					summary: input.summary,
					strengths: input.strengths,
					concerns: input.concerns,
					criteria,
					missingInformation: input.missingInformation,
					recommendedAction: input.recommendedAction,
					recommendedStage: input.recommendedStage,
					sourceUrls,
					researchedAt,
					sourceSessionId: ctx.session.id,
				},
			});
			if (count === 0) return false;

			await tx.activity.create({
				data: {
					type: ActivityType.ENRICHMENT,
					subject: `Acquisition dossier updated — ${company.name}`,
					body: dossierActivity(input),
					occurredAt: researchedAt,
					companyId: company.id,
					createdById: authorId,
					meta: {
						fit: input.fit,
						previousFit: company.acquisitionTarget?.fit ?? null,
						sourceUrls,
						agent: "acquisition-research",
					},
				},
			});

			await tx.company.update({
				where: { id: company.id },
				data: { lastActivityAt: researchedAt },
			});
			await succeedAcquisitionResearchRun(
				{
					sessionId: ctx.session.id,
					companyId: company.id,
					snapshot,
				},
				tx,
			);
			return true;
		});
		if (!written) {
			return {
				written: false as const,
				reason:
					"This company is not an acquisition target. Add it to targets before writing a dossier.",
			};
		}

		return {
			written: true as const,
			fit: input.fit,
			sources: sourceUrls.length,
			missing: input.missingInformation.length,
		};
	},
});

function dossierActivity(input: {
	fit: AcquisitionFit;
	summary: string;
	missingInformation: string[];
	recommendedAction: string;
}): string {
	const missing =
		input.missingInformation.length > 0
			? `Still missing: ${input.missingInformation.join("; ")}`
			: "No critical information gap was identified in this pass.";

	return [
		`Fit: ${input.fit.toLowerCase()}`,
		input.summary,
		missing,
		`Recommended next action: ${input.recommendedAction}`,
	].join("\n\n");
}
