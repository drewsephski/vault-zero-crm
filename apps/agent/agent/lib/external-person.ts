import { enabled, unavailable } from "./capabilities";
import { spend } from "./focus";
import { lookupCompany, searchPeople, slugFromProfileUrl } from "./linkdapi";
import { normalise } from "./names";
import {
	comprehensiveSearch,
	type ResearchSource,
	type SearchProvider,
} from "./research-search";

const NON_PERSON_TERMS = new Set([
	"a",
	"agent",
	"ai",
	"company",
	"contact",
	"corp",
	"deal",
	"find",
	"for",
	"inc",
	"linkedin",
	"llc",
	"person",
	"research",
	"the",
]);

export type ExternalPersonCandidate = {
	profileUrl: string | null;
	fullName: string | null;
	title: string | null;
	headline: string | null;
	location: string | null;
	content: string | null;
	score: number | null;
	source: "linkedin" | "web";
};

export type ExternalPersonResult =
	| {
			found: true;
			candidates: ExternalPersonCandidate[];
			publicSources: Pick<
				ResearchSource,
				"providers" | "title" | "url" | "content"
			>[];
			discovery: "web" | "linkedin" | "combined";
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
	if (!isLikelyPersonName(input.name)) {
		return {
			found: false,
			reason:
				"I need the person's actual first and last name before searching LinkedIn.",
		};
	}

	const limit = Math.min(Math.max(input.limit ?? 5, 1), 5);
	const anySearchEnabled = await enabled("ANYSEARCH_API_KEY");
	const rapidEnabled = await enabled("RAPIDAPI_KEY");
	const tavilyEnabled = await enabled("TAVILY_API_KEY");
	const linkedinCandidates: ExternalPersonCandidate[] = [];
	let rapidReason: string | undefined;
	const budgetedProviders: SearchProvider[] = [
		...(anySearchEnabled ? ["anysearch" as const] : []),
		...(tavilyEnabled ? ["tavily" as const] : []),
	];
	const web = await comprehensiveSearch(
		[
			`Research the professional background of "${input.name}".`,
			input.companyName ? `They may work at ${input.companyName}.` : "",
			input.title ? `Their title may be ${input.title}.` : "",
			"Find an official LinkedIn profile if available, plus employer pages, public talks, publications, GitHub, news, interviews, and other professional sources.",
		]
			.filter(Boolean)
			.join(" "),
		{
			providers: budgetedProviders.length > 0 ? budgetedProviders : undefined,
			intent: "identity",
			deep: true,
			maxResults: limit,
			exactMatch: true,
		},
	);
	const publicSources = web.ok ? web.sources : [];
	const webLinkedinCandidates = publicSources.flatMap((source) => {
		const slug = slugFromProfileUrl(source.url);
		if (!slug) return [];

		return [
			{
				profileUrl: `https://www.linkedin.com/in/${slug}`,
				fullName: null,
				title: source.title,
				headline: null,
				location: null,
				content: source.content || null,
				score: source.score,
				source: "linkedin" as const,
			},
		];
	});

	if (rapidEnabled && webLinkedinCandidates.length === 0) {
		let currentCompany: string | undefined;
		if (input.companyName) {
			const companyCharge = spend();
			if (companyCharge.ok) {
				const company = await lookupCompany(input.companyName);
				if (company.ok) {
					const exact = company.data.find(
						(candidate) =>
							normalise(candidate.displayName) ===
							normalise(input.companyName ?? ""),
					);
					currentCompany = (exact ?? company.data[0])?.id;
				} else {
					rapidReason = "LinkedIn company lookup was unavailable.";
				}
			} else {
				rapidReason = companyCharge.reason;
			}
		}

		const peopleCharge = spend();
		if (peopleCharge.ok) {
			const people = await searchPeople({
				keyword: input.name,
				title: input.title,
				currentCompany,
				count: limit,
			});

			if (people.ok) {
				linkedinCandidates.push(
					...people.data.map((candidate) => ({
						profileUrl: candidate.profileUrl,
						fullName: candidate.fullName,
						title: null,
						headline: candidate.headline,
						location: candidate.location,
						content: null,
						score: null,
						source: "linkedin" as const,
					})),
				);
			} else {
				rapidReason = "LinkedIn people search was unavailable.";
			}
		} else {
			rapidReason = peopleCharge.reason;
		}
	}

	const candidates = dedupeCandidates([
		...linkedinCandidates,
		...webLinkedinCandidates,
	]);

	if (candidates.length > 0 || publicSources.length > 0) {
		const discovery =
			candidates.length > 0 && publicSources.length > 0
				? "combined"
				: candidates.length > 0
					? "linkedin"
					: "web";
		return {
			found: true,
			candidates: candidates.slice(0, limit),
			publicSources: publicSources.map(
				({ providers, title, url, content }) => ({
					providers,
					title,
					url,
					content,
				}),
			),
			discovery,
			searchedFor: {
				name: input.name,
				companyName: input.companyName ?? null,
				title: input.title ?? null,
			},
			note: "LinkedIn candidates are prioritized for identity and current-role verification. The other public sources add context only; open the best LinkedIn profile and corroborate it before treating it as the person being researched.",
		};
	}

	const configuredWebProvider =
		web.ok ||
		web.providerErrors.some(({ reason }) => !/not configured/i.test(reason));
	if (
		!anySearchEnabled &&
		!rapidEnabled &&
		!tavilyEnabled &&
		!configuredWebProvider
	) {
		return {
			found: false,
			...unavailable(
				"ANYSEARCH_API_KEY, RAPIDAPI_KEY, TAVILY_API_KEY or Context.dev",
			),
		};
	}

	return {
		found: false,
		reason:
			rapidReason ??
			(web.ok ? "No public professional sources matched." : web.reason),
	};
}

function dedupeCandidates(
	candidates: ExternalPersonCandidate[],
): ExternalPersonCandidate[] {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		const key = candidate.profileUrl
			? candidate.profileUrl.toLowerCase()
			: `${candidate.fullName ?? ""}|${candidate.headline ?? ""}`.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
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

	if (kinds?.includes("contact") && isSinglePersonName(normalized)) return true;

	return isLikelyPersonName(normalized);
}

export function isLikelyPersonName(value: string): boolean {
	const words = value.trim().split(/\s+/);
	if (words.length < 2 || words.length > 5) return false;

	const cleaned = words.map((word) => word.replace(/^[.'-]+|[.'-]+$/g, ""));
	if (
		cleaned.some(
			(word) =>
				!word ||
				!/^[A-Za-z][A-Za-z.'-]*$/.test(word) ||
				NON_PERSON_TERMS.has(word.toLowerCase()),
		)
	)
		return false;

	const first = cleaned[0] ?? "";
	const last = cleaned.at(-1) ?? "";
	return (
		first.length >= 2 &&
		last.length >= 3 &&
		!/^[A-Z]{2,5}$/.test(last) &&
		cleaned.slice(1, -1).every((word) => word.length === 1 || word.length >= 2)
	);
}

function isSinglePersonName(value: string): boolean {
	return (
		/^[A-Za-z][A-Za-z.'-]{1,49}$/.test(value) &&
		!NON_PERSON_TERMS.has(value.toLowerCase())
	);
}
