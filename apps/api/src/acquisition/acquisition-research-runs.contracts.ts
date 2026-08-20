import { z } from "zod";

export const listResearchRunsInput = z.object({
	companyId: z.string().min(1),
});

export const researchRunIdInput = z.object({
	id: z.string().min(1),
});
