import { search as searchAnySearch } from "./anysearch";
import { enabled } from "./capabilities";
import { spend } from "./focus";
import { ask as askTavily } from "./tavily";

export type SearchProvider = "anysearch" | "tavily" | "context";
export type SearchIntent =
	| "general"
	| "current"
	| "news"
	| "identity"
	| "company"
	| "vertical";

export type ResearchSource = {
	providers: SearchProvider[];
	title: string;
	url: string;
	content: string;
	score: number | null;
};

export type ResearchSearchResult =
	| {
			ok: true;
			providers: SearchProvider[];
			sources: ResearchSource[];
			citations: string[];
			providerErrors: { provider: SearchProvider; reason: string }[];
	  }
	| {
			ok: false;
			reason: string;
			providerErrors: { provider: SearchProvider; reason: string }[];
	  };

export type ResearchSearchOptions = {
	providers?: readonly SearchProvider[];
	intent?: SearchIntent;
	domains?: string[];
	maxResults?: number;
	deep?: boolean;
	tag?: string;
	params?: Record<string, string>;
	topic?: "general" | "news" | "finance";
	timeRange?: "day" | "week" | "month" | "year";
	startDate?: string;
	endDate?: string;
	country?: string;
	exactMatch?: boolean;
};

type SearchAvailability = {
	anysearch: boolean;
	tavily: boolean;
};

const DEFAULT_PROVIDER_ORDER: Record<
	SearchIntent,
	readonly ("anysearch" | "tavily")[]
> = {
	general: ["anysearch", "tavily"],
	current: ["tavily", "anysearch"],
	news: ["tavily", "anysearch"],
	identity: ["tavily", "anysearch"],
	company: ["anysearch", "tavily"],
	vertical: ["anysearch"],
};

export async function comprehensiveSearch(
	query: string,
	options: ResearchSearchOptions = {},
): Promise<ResearchSearchResult> {
	const requested = options.providers
		? [...new Set(options.providers)]
		: undefined;
	const available = await availability();
	const providerErrors: { provider: SearchProvider; reason: string }[] = [];
	const providers = selectProviders(
		options,
		available,
		providerErrors,
		requested,
	);

	if (providers.length === 0) {
		return {
			ok: false,
			reason:
				options.tag || options.params
					? "AnySearch vertical research is not configured. Set ANYSEARCH_API_KEY or remove the vertical parameters."
					: providerErrors.some(({ provider }) => provider === "context")
						? "Context.dev web search is retired. Use AnySearch or Tavily for discovery, or research_company for a known company website."
						: "No configured web research provider is available.",
			providerErrors,
		};
	}

	const charge = spend(providers.length);
	if (!charge.ok) return { ok: false, reason: charge.reason, providerErrors };

	const results = await Promise.all(
		providers.map(async (provider) => ({
			provider,
			result: await searchOne(provider, query, options),
		})),
	);

	for (const result of results) {
		if (!result.result.ok) {
			providerErrors.push({
				provider: result.provider,
				reason: result.result.reason,
			});
		}
	}

	const successful = results.flatMap((result) =>
		result.result.ok ? result.result.sources : [],
	);
	const sources = mergeSources(successful);

	if (sources.length === 0) {
		return {
			ok: false,
			reason: "No configured provider returned search results.",
			providerErrors,
		};
	}

	return {
		ok: true,
		providers: providers.filter((provider) =>
			results.some(
				(result) => result.provider === provider && result.result.ok,
			),
		),
		sources,
		citations: sources.map((source) => source.url),
		providerErrors,
	};
}

export function plannedProviders(
	options: Pick<
		ResearchSearchOptions,
		"providers" | "intent" | "tag" | "params" | "deep"
	>,
	available: SearchAvailability,
): SearchProvider[] {
	return selectProviders(options, available, [], options.providers);
}

async function availability(): Promise<SearchAvailability> {
	const [anysearch, tavily] = await Promise.all([
		enabled("ANYSEARCH_API_KEY"),
		enabled("TAVILY_API_KEY"),
	]);

	return { anysearch, tavily };
}

function selectProviders(
	options: Pick<
		ResearchSearchOptions,
		"providers" | "intent" | "tag" | "params" | "deep"
	>,
	available: SearchAvailability,
	providerErrors: { provider: SearchProvider; reason: string }[],
	requested?: readonly SearchProvider[],
): SearchProvider[] {
	const explicit = requested !== undefined;
	const candidates: SearchProvider[] = explicit
		? [...new Set(requested)]
		: [
				...(DEFAULT_PROVIDER_ORDER[options.intent ?? "general"] ??
					DEFAULT_PROVIDER_ORDER.general),
			];
	const verticalOnly = Boolean(options.tag || options.params);
	const routed = verticalOnly ? ["anysearch" as const] : candidates;
	const supported = routed.filter(
		(provider): provider is "anysearch" | "tavily" =>
			provider === "anysearch" || provider === "tavily",
	);
	const configured = supported.filter((provider) => available[provider]);
	const limited =
		explicit || options.deep ? configured : configured.slice(0, 1);

	for (const provider of candidates) {
		if (provider === "context") {
			providerErrors.push({ provider, reason: unavailableReason(provider) });
			continue;
		}
		if (verticalOnly && provider !== "anysearch") continue;
		if (!available[provider]) {
			providerErrors.push({ provider, reason: unavailableReason(provider) });
		}
	}

	return limited;
}

async function searchOne(
	provider: SearchProvider,
	query: string,
	options: ResearchSearchOptions,
): Promise<
	{ ok: true; sources: ResearchSource[] } | { ok: false; reason: string }
> {
	if (provider === "anysearch") {
		const result = await searchAnySearch(toSiteQuery(query, options.domains), {
			maxResults: options.maxResults,
			tag: options.tag,
			params: options.params,
		});
		return result.ok
			? {
					ok: true,
					sources: result.data.sources.map((source) => ({
						...source,
						providers: ["anysearch"] as SearchProvider[],
					})),
				}
			: result;
	}

	if (provider === "tavily") {
		const result = await askTavily(query, {
			depth: options.deep ? "advanced" : "fast",
			domains: options.domains,
			maxResults: options.maxResults,
			includeRawContent: options.deep ? "markdown" : false,
			topic: options.topic,
			timeRange: options.timeRange,
			startDate: options.startDate,
			endDate: options.endDate,
			country: options.country,
			exactMatch: options.exactMatch,
		});
		return result.ok
			? {
					ok: true,
					sources: result.data.sources.map((source) => ({
						...source,
						providers: ["tavily"] as SearchProvider[],
					})),
				}
			: result;
	}

	return {
		ok: false,
		reason:
			"Context.dev web search is retired. Use AnySearch or Tavily for discovery, or research_company for a known company website.",
	};
}

function mergeSources(sources: ResearchSource[]): ResearchSource[] {
	const merged = new Map<string, ResearchSource>();

	for (const source of sources) {
		const key = canonicalUrl(source.url);
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, { ...source, providers: [...source.providers] });
			continue;
		}

		existing.providers = [
			...new Set([...existing.providers, ...source.providers]),
		];
		if (source.content.length > existing.content.length) {
			existing.content = source.content;
		}
		if ((source.score ?? 0) > (existing.score ?? 0)) {
			existing.score = source.score;
		}
	}

	return [...merged.values()].sort(
		(a, b) =>
			b.providers.length - a.providers.length ||
			(b.score ?? 0) - (a.score ?? 0),
	);
}

function canonicalUrl(value: string): string {
	try {
		const url = new URL(value);
		url.hostname = url.hostname.toLowerCase();
		url.hash = "";
		url.pathname = url.pathname.replace(/\/$/, "") || "/";
		for (const key of [...url.searchParams.keys()]) {
			if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
		}
		return url.toString();
	} catch {
		return value;
	}
}

function toSiteQuery(query: string, domains?: string[]): string {
	if (!domains || domains.length === 0) return query;
	return `${query} ${domains.map((domain) => `site:${domain}`).join(" ")}`;
}

function unavailableReason(provider: SearchProvider): string {
	if (provider === "anysearch") return "ANYSEARCH_API_KEY is not configured.";
	if (provider === "tavily") return "TAVILY_API_KEY is not configured.";
	return "Context.dev web search is retired; use research_company for known company websites.";
}
