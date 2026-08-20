import { z } from "zod";
import { spend } from "../lib/focus";
import { looksLikeSameCompany, namesMatch } from "../lib/names";
import { defineTool } from "../lib/tool";
import {
	getExperience,
	getProfile,
	slugFromLinkedinInput,
} from "../lib/web-profile";

export default defineTool({
	description:
		"Read a supplied LinkedIn profile for an external person. Accepts a linkedin.com/in URL or username and returns observed profile fields plus match signals. It does not write to the CRM and does not require an email or existing contact.",
	inputSchema: z.object({
		profile: z.string().trim().min(3),
		expectedName: z.string().trim().min(2).optional(),
		expectedCompany: z.string().trim().min(2).optional(),
		expectedDomain: z.string().trim().min(3).optional(),
		includeHistory: z
			.boolean()
			.default(false)
			.describe(
				"Also fetch the person's full work history as an extra request.",
			),
	}),
	async execute({
		profile,
		expectedName,
		expectedCompany,
		expectedDomain,
		includeHistory,
	}) {
		const slug = slugFromLinkedinInput(profile);
		if (!slug) {
			return {
				found: false as const,
				reason: "Enter a LinkedIn profile URL or username such as drewsepeczi.",
			};
		}

		const charge = spend(includeHistory ? 2 : 1);
		if (!charge.ok) return { found: false as const, reason: charge.reason };

		const result = await getProfile(slug);
		if (!result.ok) {
			return {
				found: false as const,
				reason: result.missing ? "No such LinkedIn profile." : result.reason,
			};
		}

		const currentName = result.data.fullName ?? "";
		const employerMatches = expectedCompany
			? result.data.positions.some((position) =>
					looksLikeSameCompany(
						position.name,
						expectedCompany,
						expectedDomain ?? "",
					),
				)
			: null;
		const nameMatches = expectedName
			? namesMatch(currentName, expectedName)
			: null;
		const history =
			includeHistory && result.data.urn
				? await getExperience(result.data.urn)
				: null;

		return {
			found: true as const,
			profile: result.data,
			experience: history?.ok ? history.data : null,
			sourceUrl: result.data.profileUrl,
			matchSignals: { nameMatches, employerMatches },
			note: "These fields and the work history were observed on the supplied LinkedIn profile. Summarize the headline, location, current role, prior roles and other observed profile details, then confirm the person before creating or updating a CRM record.",
		};
	},
});
