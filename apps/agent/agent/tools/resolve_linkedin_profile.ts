import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import { spend } from "../lib/focus";
import { searchTerms } from "../lib/names";
import { findProfileUrls } from "../lib/tavily";
import { defineTool } from "../lib/tool";
import { searchPeople } from "../lib/web-profile";

export default defineTool({
	description:
		"Find candidate LinkedIn profile slugs for a work email address using AnySearch and Tavily public web search. Returns CANDIDATES ONLY — you must verify each with get_linkedin_profile before believing any of them.",
	inputSchema: z.object({
		email: z.string().describe("The contact's work email address."),
		companyName: z.string().describe("The company the CRM has them at."),
	}),
	async execute({ email, companyName }) {
		const tavilyEnabled = await enabled("TAVILY_API_KEY");
		const local = email.split("@")[0] ?? "";
		const terms = searchTerms(local);

		if (tavilyEnabled) {
			const charge = spend();
			if (!charge.ok) return { candidateSlugs: [], note: charge.reason };

			const slugs = await findProfileUrls(terms, companyName);
			if (slugs.length > 0) {
				return {
					searchedFor: terms,
					candidateSlugs: slugs.slice(0, 5),
					note: "Unverified. Each slug must be checked with get_linkedin_profile.",
					source: "Tavily public web search",
				};
			}
		}

		const charge = spend();
		if (!charge.ok) return { candidateSlugs: [], note: charge.reason };
		const result = await searchPeople({
			keyword: terms[1] ?? terms[0] ?? local,
			currentCompany: companyName,
			count: 10,
		});
		if (result.ok && result.data.length > 0) {
			return {
				searchedFor: terms,
				candidateSlugs: result.data.flatMap((candidate) =>
					candidate.slug ? [candidate.slug] : [],
				),
				candidates: result.data,
				note: "Unverified. Each slug must be checked with get_linkedin_profile.",
				source: "AnySearch and Tavily public web search",
			};
		}

		return {
			candidateSlugs: [],
			...(tavilyEnabled || (await enabled("ANYSEARCH_API_KEY"))
				? { note: "No LinkedIn candidates found." }
				: unavailable("TAVILY_API_KEY or ANYSEARCH_API_KEY")),
		};
	},
});
