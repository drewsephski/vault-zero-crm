import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import { spend } from "../lib/focus";
import { lookupCompany, searchPeople } from "../lib/linkdapi";
import { normalise, searchTerms } from "../lib/names";
import { findProfileUrls } from "../lib/tavily";
import { defineTool } from "../lib/tool";

export default defineTool({
	description:
		"Find candidate LinkedIn profile slugs for a work email address, using RapidAPI People Search when configured and Tavily otherwise. Returns CANDIDATES ONLY — you must verify each with get_linkedin_profile before believing any of them.",
	inputSchema: z.object({
		email: z.string().describe("The contact's work email address."),
		companyName: z.string().describe("The company the CRM has them at."),
	}),
	async execute({ email, companyName }) {
		const rapidEnabled = await enabled("RAPIDAPI_KEY");
		const tavilyEnabled = await enabled("TAVILY_API_KEY");
		let rapidReason: string | undefined;

		if (rapidEnabled) {
			const companyCharge = spend();
			if (!companyCharge.ok) {
				return { candidateSlugs: [], note: companyCharge.reason };
			}

			const company = await lookupCompany(companyName);
			const exactCompany = company.ok
				? company.data.find(
						(candidate) =>
							normalise(candidate.displayName) === normalise(companyName),
					)
				: undefined;

			const rapidCharge = spend();
			if (!rapidCharge.ok) {
				return { candidateSlugs: [], note: rapidCharge.reason };
			}

			const local = email.split("@")[0] ?? "";
			const terms = searchTerms(local);
			const rapid = await searchPeople({
				keyword: terms[1] ?? terms[0] ?? local,
				currentCompany: exactCompany?.id,
				count: 10,
			});

			if (rapid.ok && rapid.data.length > 0) {
				return {
					searchedFor: terms,
					candidateSlugs: rapid.data.flatMap((candidate) =>
						candidate.slug ? [candidate.slug] : [],
					),
					candidates: rapid.data,
					note: "Unverified. Each slug must be checked with get_linkedin_profile.",
					source: "RapidAPI LinkedIn People Search",
				};
			}

			rapidReason = rapid.ok
				? "No LinkedIn candidates matched the email and company."
				: rapid.missing
					? "No LinkedIn candidates matched the email and company."
					: rapid.reason;
		}

		if (!tavilyEnabled) {
			return {
				candidateSlugs: [],
				...(rapidEnabled
					? { note: rapidReason ?? "No LinkedIn candidates found." }
					: unavailable("TAVILY_API_KEY")),
			};
		}

		const charge = spend();
		if (!charge.ok) return { candidateSlugs: [], note: charge.reason };

		const local = email.split("@")[0] ?? "";
		const terms = searchTerms(local);
		const slugs = await findProfileUrls(terms, companyName);

		return {
			searchedFor: terms,
			candidateSlugs: slugs.slice(0, 5),
			note: "Unverified. Each slug must be checked with get_linkedin_profile.",
		};
	},
});
