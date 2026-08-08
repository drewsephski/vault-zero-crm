const ENDPOINT = "https://api.tavily.com/search";
const TIMEOUT_MS = 30_000;

export type SearchSource = {
	title: string;
	url: string;
	content: string;
	score: number | null;
};

export type Answer = {
	text: string;
	citations: string[];
	sources: SearchSource[];
};

export type ProfileSearchCandidate = {
	slug: string;
	profileUrl: string;
	title: string;
	content: string;
	score: number | null;
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export type AskOptions = {
	depth?: "basic" | "advanced";
	domains?: string[];
	includeRawContent?: "markdown" | "text" | true;
	maxResults?: number;
};

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function score(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function httpUrl(value: unknown): string | null {
	const candidate = text(value);
	if (!candidate) return null;

	try {
		const url = new URL(candidate);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function source(value: unknown): SearchSource | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;

	const row = value as Record<string, unknown>;
	const url = httpUrl(row.url);
	if (!url) return null;

	return {
		title: text(row.title) || url,
		url,
		content: text(row.content),
		score: score(row.score),
	};
}

function sourceText(sources: SearchSource[]): string {
	return sources
		.map(
			(item) =>
				`${item.title}\n${item.url}${item.content ? `\n${item.content}` : ""}`,
		)
		.join("\n\n");
}

export async function ask(
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	const apiKey = process.env.TAVILY_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "No TAVILY_API_KEY." };

	try {
		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			signal: AbortSignal.timeout(TIMEOUT_MS),
			body: JSON.stringify({
				query: question,
				search_depth: options.depth ?? "basic",
				max_results: Math.min(Math.max(options.maxResults ?? 5, 1), 20),
				topic: "general",
				include_answer: false,
				include_raw_content: options.includeRawContent ?? "markdown",
				...(options.domains ? { include_domains: options.domains } : {}),
			}),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const body = (await response.json()) as { results?: unknown };
		const sources = Array.isArray(body.results)
			? body.results.flatMap((value) => {
					const parsed = source(value);
					return parsed ? [parsed] : [];
				})
			: [];

		if (sources.length === 0) {
			return { ok: false, reason: "No search results." };
		}

		return {
			ok: true,
			data: {
				text: sourceText(sources),
				citations: [...new Set(sources.map((item) => item.url))],
				sources,
			},
		};
	} catch (error) {
		const aborted =
			error instanceof Error &&
			(error.name === "TimeoutError" || error.name === "AbortError");
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	}
}

export async function findProfileUrls(
	terms: string[],
	companyName: string,
): Promise<string[]> {
	if (terms.length === 0) return [];

	const slugs: string[] = [];
	const names = terms.map((term) => `"${term}"`).join(" or ");
	const answer = await ask(
		`Find the LinkedIn profile of the person called ${names} who works at ${companyName}.`,
		{ domains: ["linkedin.com"], maxResults: 5 },
	);

	if (!answer.ok) return slugs;

	const haystack = [answer.data.text, ...answer.data.citations].join(" ");
	for (const match of haystack.matchAll(
		/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/g,
	)) {
		const slug = match[1];
		if (slug && !slugs.includes(slug)) slugs.push(slug);
	}

	return slugs;
}

export async function findPersonProfileCandidates(
	name: string,
	companyName?: string,
	title?: string,
): Promise<ProfileSearchCandidate[]> {
	const query = [
		`Find the LinkedIn profile for ${name}`,
		companyName ? `who works at ${companyName}` : "",
		title ? `and has the title ${title}` : "",
	]
		.filter(Boolean)
		.join(" ");
	const answer = await ask(query, {
		domains: ["linkedin.com"],
		maxResults: 5,
	});

	if (!answer.ok) return [];

	return answer.data.sources.flatMap((item) => {
		const match = item.url.match(
			/^https?:\/\/(?:[^/]+)\/in\/([A-Za-z0-9_%-]+)/i,
		);
		const slug = match?.[1];
		if (!slug) return [];

		return [
			{
				slug,
				profileUrl: `https://www.linkedin.com/in/${slug}`,
				title: item.title,
				content: item.content,
				score: item.score,
			},
		];
	});
}
