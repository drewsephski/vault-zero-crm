import { search as searchAnySearch } from "./anysearch";
import { enabled } from "./capabilities";
import { contextDevEnabled, search as searchContextDev } from "./context-dev";
import { spend } from "./focus";
import { ask as askTavily } from "./tavily";

export type SearchProvider = "anysearch" | "tavily" | "context";

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
	domains?: string[];
	maxResults?: number;
	deep?: boolean;
	tag?: string;
	params?: Record<string, string>;
};

const ALL_PROVIDERS: readonly SearchProvider[] = [
	"anysearch",
	"tavily",
	"context",
];

export async function comprehensiveSearch(
	query: string,
	options: ResearchSearchOptions = {},
): Promise<ResearchSearchResult> {
	const requested = [...new Set(options.providers ?? ALL_PROVIDERS)];
	const available = await availability();
	const providerErrors: { provider: SearchProvider; reason: string }[] = [];
	const providers = requested.filter((provider) => {
		if (options.tag || options.params) {
			if (provider !== "anysearch") return false;
			if (!available.anysearch) {
				providerErrors.push({
					provider,
					reason: "AnySearch is not configured.",
				});
				return false;
			}
			return true;
		}

		if (available[provider]) return true;
		providerErrors.push({
			provider,
			reason: unavailableReason(provider),
		});
		return false;
	});

	if (providers.length === 0) {
		return {
			ok: false,
			reason:
				options.tag || options.params
					? "AnySearch vertical research is not configured. Set ANYSEARCH_API_KEY or remove the vertical parameters."
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

async function availability(): Promise<Record<SearchProvider, boolean>> {
	const [anysearch, tavily, context] = await Promise.all([
		enabled("ANYSEARCH_API_KEY"),
		enabled("TAVILY_API_KEY"),
		contextDevEnabled(),
	]);

	return { anysearch, tavily, context };
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
			depth: options.deep ? "advanced" : "basic",
			domains: options.domains,
			maxResults: options.maxResults,
			includeRawContent: "markdown",
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

	const result = await searchContextDev(query, {
		includeDomains: options.domains,
		includeMarkdown: true,
		limit: options.maxResults,
		queryFanout: Boolean(options.deep),
	});
	if (result.outcome === "failed") {
		return { ok: false, reason: result.reason };
	}

	const sources = result.results.flatMap((source) => {
		if (!source.url) return [];
		return [
			{
				providers: ["context"] as SearchProvider[],
				title: source.title ?? source.url,
				url: source.url,
				content: source.markdown ?? source.description ?? "",
				score: null,
			},
		];
	});

	return sources.length > 0
		? { ok: true, sources }
		: { ok: false, reason: "No search results." };
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

	return [...merged.values()];
}

function canonicalUrl(value: string): string {
	try {
		const url = new URL(value);
		url.hash = "";
		url.pathname = url.pathname.replace(/\/$/, "") || "/";
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
	return "Context.dev is not configured in Settings → General.";
}
