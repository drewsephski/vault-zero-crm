import {
	AcquisitionEngagementStage,
	AcquisitionEngagementStatus,
} from "@crm/db";
import { isCurrencyCode, normalizeCurrency } from "@crm/db/currency";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const createAcquisitionEngagementInput = z.object({
	companyId: z.string().min(1),
	idempotencyKey: z.string().uuid(),
	ownerId: z.string().min(1).nullable().optional(),
	amountCents: z.number().int().nonnegative().nullable().optional(),
	currency: z
		.string()
		.trim()
		.transform(normalizeCurrency)
		.refine(isCurrencyCode, "Choose a supported currency.")
		.optional(),
	expectedCloseDate: z.string().datetime().nullable().optional(),
	stage: z
		.enum([
			AcquisitionEngagementStage.OUTREACH,
			AcquisitionEngagementStage.ENGAGED,
			AcquisitionEngagementStage.NDA,
			AcquisitionEngagementStage.MATERIALS_RECEIVED,
			AcquisitionEngagementStage.UNDERWRITING,
			AcquisitionEngagementStage.LOI,
			AcquisitionEngagementStage.DILIGENCE,
			AcquisitionEngagementStage.FINANCING,
			AcquisitionEngagementStage.CLOSING,
		])
		.optional(),
});

export const listAcquisitionEngagementsInput = listInput.extend({
	status: z.enum(["all", "active", "terminal"]).default("all"),
	owner: z.string().default("all"),
	stage: z
		.union([z.literal("all"), z.enum(AcquisitionEngagementStage)])
		.default("all"),
	companyId: z.string().min(1).optional(),
});

export const engagementTargetOptionsInput = z.object({
	q: z.string().default(""),
});

export const updateAcquisitionEngagementStageInput = z
	.object({
		engagementId: z.string().min(1),
		stage: z.enum(AcquisitionEngagementStage),
		closedReason: z.string().trim().min(1).max(500).optional(),
	})
	.superRefine((input, context) => {
		if (
			input.stage === AcquisitionEngagementStage.PASSED &&
			!input.closedReason
		) {
			context.addIssue({
				code: "custom",
				message: "Add a reason before passing on this opportunity.",
				path: ["closedReason"],
			});
		}
	});

export const updateAcquisitionEngagementInput = z.object({
	engagementId: z.string().min(1),
	ownerId: z.string().min(1).nullable().optional(),
	amountCents: z.number().int().nonnegative().nullable().optional(),
	currency: z
		.string()
		.trim()
		.transform(normalizeCurrency)
		.refine(isCurrencyCode, "Choose a supported currency.")
		.optional(),
	expectedCloseDate: z.string().datetime().nullable().optional(),
});

export type CreateAcquisitionEngagementInput = z.infer<
	typeof createAcquisitionEngagementInput
>;

export type ListAcquisitionEngagementsInput = z.input<
	typeof listAcquisitionEngagementsInput
>;

export type EngagementTargetOptionsInput = z.input<
	typeof engagementTargetOptionsInput
>;

export type UpdateAcquisitionEngagementStageInput = z.infer<
	typeof updateAcquisitionEngagementStageInput
>;

export type UpdateAcquisitionEngagementInput = z.infer<
	typeof updateAcquisitionEngagementInput
>;

export const ENGAGEMENT_STATUS_FILTERS = {
	active: AcquisitionEngagementStatus.ACTIVE,
	terminal: AcquisitionEngagementStatus.TERMINAL,
} as const;
