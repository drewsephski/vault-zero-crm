import { defineTool } from "eve/tools";
import { z } from "zod";
import { researchExternalPerson } from "../lib/external-person";

export default defineTool({
	description:
		"Research a person who is not in the CRM. Prioritize LinkedIn for identity and current-role verification, then add broader public context from AnySearch, Tavily, and Context.dev when configured. Candidates are unverified; read a profile and ask the rep to confirm before writing anything.",
	inputSchema: z.object({
		name: z.string().trim().min(2),
		companyName: z.string().trim().min(2).optional(),
		title: z.string().trim().min(2).optional(),
		limit: z.number().int().min(1).max(5).default(5),
	}),
	async execute(input) {
		return researchExternalPerson(input);
	},
});
