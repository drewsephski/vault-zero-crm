import {
	AcquisitionEngagementStage,
	AcquisitionEngagementStatus,
} from "@crm/db";
import { z } from "zod";

export const createAcquisitionEngagementInput = z.object({
	companyId: z.string().min(1),
	idempotencyKey: z.string().uuid(),
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

export const listAcquisitionEngagementsInput = z.object({
	companyId: z.string().min(1).optional(),
	status: z
		.enum([
			AcquisitionEngagementStatus.ACTIVE,
			AcquisitionEngagementStatus.TERMINAL,
		])
		.optional(),
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
