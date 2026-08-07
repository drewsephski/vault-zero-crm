import { enabled, unavailable } from "./capabilities";
import { spend } from "./focus";
import { lookupCompany, searchPeople } from "./linkdapi";
import { normalise } from "./names";
import { findPersonProfileCandidates } from "./tavily";

export type ExternalPersonCandidate = {
	profileUrl: string | null;
	fullName: string | null;
	title: string | null;
	headline: string | null;
	location: string | null;
	content: string | null;
	score: number | null;
};

export type ExternalPersonResult =
	| {
			found: true;
			candidates: ExternalPersonCandidate[];
			discovery: "web" | "linkedin";
			searchedFor: {
				name: string;
				companyName: string | null;
				title: string | null;
			};
			note: string;
	  }
	| {
			found: false;
			reason: string;
			configured?: boolean;
	  };

export async function researchExternalPerson(input: {
	name: string;
	companyName?: string;
	title?: string;
	limit?: number;
}): Promise<ExternalPersonResult> {
	const limit = Math.min(Math.max(input.limit ?? 5, 1), 5);
	const rapidEnabled = await enabled("RAPIDAPI_KEY");
	const tavilyEnabled = await enabled("TAVILY_API_KEY");

	if (tavilyEnabled) {
		const charge = spend();
		if (!charge.ok) return { found: false, reason: charge.reason };

		const candidates = await findPersonProfileCandidates(
			input.name,
			input.companyName,
			input.title,
		);
		if (candidates.length > 0) {
			return {
				found: true,
				candidates: candidates.slice(0, limit).map((candidate) => ({
					profileUrl: candidate.profileUrl,
					fullName: null,
					title: candidate.title,
					headline: null,
					location: null,
					content: candidate.content,
					score: candidate.score,
				})),
				discovery: "web",
				searchedFor: {
					name: input.name,
					companyName: input.companyName ?? null,
					title: input.title ?? null,
				},
				note: "Tavily found these profile candidates. Search results are not identity evidence; read a profile before asking the rep to confirm it.",
			};
		}
	}

	if (rapidEnabled) {
		let currentCompany: string | undefined;
		if (input.companyName) {
			const companyCharge = spend();
			if (!companyCharge.ok) {
				return { found: false, reason: companyCharge.reason };
			}

			const company = await lookupCompany(input.companyName);
			if (company.ok) {
				const exact = company.data.find(
					(candidate) =>
						normalise(candidate.displayName) ===
						normalise(input.companyName ?? ""),
				);
				currentCompany = (exact ?? company.data[0])?.id;
			}
		}

		const peopleCharge = spend();
		if (!peopleCharge.ok) return { found: false, reason: peopleCharge.reason };

		const people = await searchPeople({
			keyword: input.name,
			title: input.title,
			currentCompany,
			count: limit,
		});

		if (people.ok && people.data.length > 0) {
			return {
				found: true,
				candidates: people.data.slice(0, limit).map((candidate) => ({
					profileUrl: candidate.profileUrl,
					fullName: candidate.fullName,
					title: null,
					headline: candidate.headline,
					location: candidate.location,
					content: null,
					score: null,
				})),
				discovery: "linkedin",
				searchedFor: {
					name: input.name,
					companyName: input.companyName ?? null,
					title: input.title ?? null,
				},
				note: "These are candidates only. Read the selected profile and corroborate it before treating it as the person being researched.",
			};
		}
	}

	if (!rapidEnabled && !tavilyEnabled) {
		return {
			found: false,
			...unavailable("RAPIDAPI_KEY or TAVILY_API_KEY"),
		};
	}

	return {
		found: false,
		reason: "No external LinkedIn profile candidates matched.",
	};
}

export function looksLikePersonSearch(
	query: string,
	kinds?: ("contact" | "company" | "deal")[],
): boolean {
	if (kinds?.length === 1 && kinds[0] !== "contact") return false;

	const normalized = query.trim();
	if (!normalized || normalized.includes("@")) return false;
	if (/\b(?:https?:\/\/|www\.)/i.test(normalized)) return false;
	if (/\.[a-z]{2,}(?:\/|$)/i.test(normalized)) return false;

	return (
		normalized.split(/\s+/).length >= 2 || kinds?.includes("contact") === true
	);
}
