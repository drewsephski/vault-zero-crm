import { AcquisitionStage } from "@crm/db";
import { TARGET_LIFECYCLE_STAGES } from "@crm/db/acquisition";
import { z } from "zod";
import { companyCreateInput } from "../companies/companies.contracts";

export const createAcquisitionTargetInput = companyCreateInput.extend({
	idempotencyKey: z.string().uuid(),
});

export type CreateAcquisitionTargetInput = z.infer<
	typeof createAcquisitionTargetInput
>;

export const addAcquisitionTargetInput = z.object({
	companyId: z.string().min(1),
});

export type TargetResearchResult =
	| { status: "queued"; taskId: string }
	| {
			status: "blocked";
			blocker: "missing-domain" | "missing-buy-box";
	  }
	| { status: "failed"; blocker: "queue-unavailable" };

export type TargetMutationResult = {
	companyId: string;
	created: boolean;
	targetCreated: boolean;
	stage: AcquisitionStage;
	research: TargetResearchResult;
};

export const acquisitionCandidateIdInput = z.object({ id: z.string().min(1) });

export const updateAcquisitionTargetInput = z.object({
	companyId: z.string().min(1),
	stage: z.enum(TARGET_LIFECYCLE_STAGES),
});

export const acquisitionCompanyIdInput = z.object({
	companyId: z.string().min(1),
});

export const acceptRecommendedStageInput = acquisitionCompanyIdInput.extend({
	idempotencyKey: z.string().uuid().optional(),
});

export const dismissRecommendedStageInput = acquisitionCompanyIdInput;

export const acceptRecommendedActionInput = acquisitionCompanyIdInput.extend({
	idempotencyKey: z.string().uuid().optional(),
	dueAt: z.string().datetime().optional(),
});

export const dismissRecommendedActionInput = acquisitionCompanyIdInput;
