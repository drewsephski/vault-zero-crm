import { defineTool } from "eve/tools";
import { z } from "zod";
import { CRM, enabled, unavailableCapability } from "../lib/capabilities";
import {
	looksLikePersonSearch,
	researchExternalPerson,
} from "../lib/external-person";
import { searchCrm } from "../lib/lookup";

export default defineTool({
	description:
		"Find contacts, companies and deals by name, email address, domain or deal name — the way a person would search. Returns each match with its id, so you never have to ask a rep for one. Free. Use it whenever a question names a record you do not have the id for. When a person-like query has no CRM match, this tool automatically starts external person discovery and returns its candidates in the same result.",
	inputSchema: z.object({
		query: z
			.string()
			.min(2)
			.describe(
				"A name, an email address, a domain, or part of one. 'Comp AI', 'marchetti', 'fernhill.com'.",
			),
		kinds: z
			.array(z.enum(["contact", "company", "deal"]))
			.optional()
			.describe("Narrow the search. Defaults to all three."),
		limit: z.number().int().min(1).max(25).default(10),
	}),
	async execute({ query, kinds, limit }) {
		if (!(await enabled(CRM))) return unavailableCapability("CRM database");

		let result: Awaited<ReturnType<typeof searchCrm>>;
		try {
			result = await searchCrm(query, { kinds, limit });
		} catch {
			return unavailableCapability("CRM database");
		}

		const externalResearch =
			result.total === 0 &&
			!result.needsQuery &&
			looksLikePersonSearch(query, kinds)
				? await researchExternalPerson({ name: query, limit: 5 })
				: null;

		return {
			...result,
			...(externalResearch ? { externalResearch } : {}),
			note: result.needsQuery
				? "This is a search action, not a search target. Ask the rep for the person's name, email address, or company domain before calling search_crm again."
				: result.total === 0
					? externalResearch?.found
						? "Nothing in the CRM matched, so external person discovery has already started. Read the best candidate before asking the rep for more information."
						: externalResearch
							? "Nothing in the CRM matched. External person discovery has already run. If no candidate was found, ask for a LinkedIn profile URL or username — not an email, company or domain unless the rep volunteers it."
							: "Nothing in the CRM matches. That is an answer: say so rather than asking the rep to search for you. Try a shorter or differently spelled term first — a surname alone often works where a full name does not."
					: result.total > 1
						? "More than one match. If it is genuinely ambiguous, name the candidates and ask which — never ask for an id."
						: undefined,
		};
	},
});
