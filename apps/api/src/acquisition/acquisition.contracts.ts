import { AcquisitionStage } from "@crm/db";
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
	stage: z.enum([
		AcquisitionStage.DISCOVERED,
		AcquisitionStage.RESEARCHING,
		AcquisitionStage.QUALIFIED,
		AcquisitionStage.WATCHLIST,
		AcquisitionStage.CONTACTED,
		AcquisitionStage.INTERESTED,
		AcquisitionStage.OPPORTUNITY,
		AcquisitionStage.DILIGENCE,
		AcquisitionStage.REJECTED,
		AcquisitionStage.ACQUIRED,
	]),
});
