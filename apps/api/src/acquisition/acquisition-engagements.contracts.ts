import {
	AcquisitionEngagementStage,
	AcquisitionEngagementStatus,
} from "@crm/db";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const createAcquisitionEngagementInput = z.object({
	companyId: z.string().min(1),
	idempotencyKey: z.string().uuid(),
	ownerId: z.string().min(1).optional(),
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
	status: z.string().default("all"),
	owner: z.string().default("all"),
	stage: z.string().default("all"),
	companyId: z.string().min(1).optional(),
});

export const engagementTargetOptionsInput = z.object({
	q: z.string().default(""),
});

export const updateAcquisitionEngagementStageInput = z.object({
	engagementId: z.string().min(1),
	stage: z.enum([
		AcquisitionEngagementStage.OUTREACH,
		AcquisitionEngagementStage.ENGAGED,
		AcquisitionEngagementStage.NDA,
		AcquisitionEngagementStage.MATERIALS_RECEIVED,
		AcquisitionEngagementStage.UNDERWRITING,
		AcquisitionEngagementStage.LOI,
		AcquisitionEngagementStage.DILIGENCE,
		AcquisitionEngagementStage.FINANCING,
		AcquisitionEngagementStage.CLOSING,
		AcquisitionEngagementStage.ACQUIRED,
		AcquisitionEngagementStage.PASSED,
	]),
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

export const ENGAGEMENT_STATUS_FILTERS = {
	active: AcquisitionEngagementStatus.ACTIVE,
	terminal: AcquisitionEngagementStatus.TERMINAL,
} as const;
