import { defineTool } from "../lib/tool";
import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import { isLikelyPersonName } from "../lib/external-person";
import { spend } from "../lib/focus";
import { lookupCompany, searchPeople } from "../lib/linkdapi";
import { normalise } from "../lib/names";

export default defineTool({
	description:
		"Search LinkedIn's professional index through RapidAPI for a person by name, optionally narrowed by company or title. Use this when a rep explicitly asks to search LinkedIn, including when the person is not in the CRM. Results are candidates, not verified CRM identity; never write a fact from this tool alone.",
	inputSchema: z.object({
		name: z.string().trim().min(2).describe("The person's name to search for."),
		companyName: z
			.string()
			.trim()
			.min(2)
			.optional()
			.describe("The company they may work for."),
		title: z
			.string()
			.trim()
			.min(2)
			.optional()
			.describe("An optional job title filter."),
		limit: z.number().int().min(1).max(10).default(5),
	}),
	async execute({ name, companyName, title, limit }) {
		if (!isLikelyPersonName(name)) {
			return {
				found: false as const,
				reason:
					"I need the person's actual first and last name before searching LinkedIn.",
			};
		}

		if (!(await enabled("RAPIDAPI_KEY"))) {
			return { found: false as const, ...unavailable("RAPIDAPI_KEY") };
		}

		let currentCompany: string | undefined;
		if (companyName) {
			const charge = spend();
			if (!charge.ok) return { found: false as const, reason: charge.reason };

			const company = await lookupCompany(companyName);
			if (company.ok) {
				const exact = company.data.find(
					(candidate) =>
						normalise(candidate.displayName) === normalise(companyName),
				);
				currentCompany = (exact ?? company.data[0])?.id;
			}
		}

		const charge = spend();
		if (!charge.ok) return { found: false as const, reason: charge.reason };

		const result = await searchPeople({
			keyword: name,
			title,
			currentCompany,
			count: limit,
		});

		if (!result.ok) {
			return {
				found: false as const,
				reason: result.missing ? "No LinkedIn people matched." : result.reason,
			};
		}

		const candidates = result.data.slice(0, limit);
		return {
			found: candidates.length > 0,
			candidates,
			searchedFor: {
				name,
				companyName: companyName ?? null,
				title: title ?? null,
			},
			note:
				candidates.length > 0
					? "These are search candidates. Open a profile and corroborate it with the CRM before treating it as the person being researched."
					: "No LinkedIn candidates matched these filters. Do not invent a profile or name.",
		};
	},
});
