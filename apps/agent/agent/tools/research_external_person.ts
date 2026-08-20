import { defineTool } from "../lib/tool";
import { z } from "zod";
import { researchExternalPerson } from "../lib/external-person";

export default defineTool({
	description:
		"Research a named person who is not in the CRM, or whose CRM record does not answer the question. Use the resolved full name from the conversation, including when the rep used a shortened first name or pronoun. Prioritize LinkedIn for identity and current-role verification, then add broader public context from AnySearch and Tavily when configured. Candidates are unverified; read the strongest profile and summarize the public professional analysis before asking the rep to confirm anything.",
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
