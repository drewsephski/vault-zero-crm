import { defineTool } from "eve/tools";
import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import { spend } from "../lib/focus";
import { lookupCompany, searchPeople } from "../lib/linkdapi";
import { normalise } from "../lib/names";
import { findPersonProfileCandidates } from "../lib/tavily";

export default defineTool({
	description:
		"Research a person who is not in the CRM. Search LinkedIn through RapidAPI when configured, then fall back to Tavily to find candidate LinkedIn profiles. Candidates are unverified; read a profile and ask the rep to confirm before writing anything.",
	inputSchema: z.object({
		name: z.string().trim().min(2),
		companyName: z.string().trim().min(2).optional(),
		title: z.string().trim().min(2).optional(),
		limit: z.number().int().min(1).max(5).default(5),
	}),
	async execute({ name, companyName, title, limit }) {
		const rapidEnabled = await enabled("RAPIDAPI_KEY");
		const tavilyEnabled = await enabled("TAVILY_API_KEY");

		if (rapidEnabled) {
			let currentCompany: string | undefined;
			if (companyName) {
				const companyCharge = spend();
				if (!companyCharge.ok) {
					return { found: false as const, reason: companyCharge.reason };
				}

				const company = await lookupCompany(companyName);
				if (company.ok) {
					const exact = company.data.find(
						(candidate) =>
							normalise(candidate.displayName) === normalise(companyName),
					);
					currentCompany = (exact ?? company.data[0])?.id;
				}
			}

			const peopleCharge = spend();
			if (!peopleCharge.ok) {
				return { found: false as const, reason: peopleCharge.reason };
			}

			const people = await searchPeople({
				keyword: name,
				title,
				currentCompany,
				count: limit,
			});

			if (people.ok && people.data.length > 0) {
				return {
					found: true as const,
					candidates: people.data.slice(0, limit),
					discovery: "linkedin" as const,
					searchedFor: {
						name,
						companyName: companyName ?? null,
						title: title ?? null,
					},
					note: "These are candidates only. Read the selected profile and corroborate it before treating it as the person being researched.",
				};
			}
		}

		if (tavilyEnabled) {
			const charge = spend();
			if (!charge.ok) return { found: false as const, reason: charge.reason };

			const candidates = await findPersonProfileCandidates(
				name,
				companyName,
				title,
			);
			if (candidates.length > 0) {
				return {
					found: true as const,
					candidates: candidates.slice(0, limit),
					discovery: "web" as const,
					searchedFor: {
						name,
						companyName: companyName ?? null,
						title: title ?? null,
					},
					note: "Tavily found these profile candidates. Search results are not identity evidence; read a profile before asking the rep to confirm it.",
				};
			}
		}

		if (!rapidEnabled && !tavilyEnabled) {
			return {
				found: false as const,
				...unavailable("RAPIDAPI_KEY or TAVILY_API_KEY"),
			};
		}

		return {
			found: false as const,
			reason: "No external LinkedIn profile candidates matched.",
		};
	},
});
