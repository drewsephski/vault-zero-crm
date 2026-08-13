import { AcquisitionStage } from "@crm/db";
import { z } from "zod";

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
