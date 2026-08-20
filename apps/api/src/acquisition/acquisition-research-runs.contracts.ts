import { z } from "zod";

export const listResearchRunsInput = z.object({
	companyId: z.string().min(1),
	limit: z.number().int().min(1).max(20).default(5),
});

export const researchRunIdInput = z.object({
	id: z.string().min(1),
});
