const ENDPOINT = "https://api.anysearch.com/v1/search";
const TIMEOUT_MS = 30_000;

export type AnySearchSource = {
	title: string;
	url: string;
	content: string;
	score: number | null;
};

export type AnySearchAnswer = {
	sources: AnySearchSource[];
	citations: string[];
	requestId: string | null;
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export type AnySearchOptions = {
	maxResults?: number;
	tag?: string;
	params?: Record<string, string>;
	zone?: "cn" | "intl";
	language?: string;
	format?: "json" | "markdown";
};

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
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

function source(value: unknown): AnySearchSource | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;

	const row = value as Record<string, unknown>;
	const url = httpUrl(row.url);
	if (!url) return null;

	return {
		title: text(row.title) || url,
		url,
		content: text(row.content) || text(row.snippet),
		score: null,
	};
}

export async function search(
	query: string,
	options: AnySearchOptions = {},
): Promise<Outcome<AnySearchAnswer>> {
	const apiKey = process.env.ANYSEARCH_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "No ANYSEARCH_API_KEY." };

	try {
		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			signal: AbortSignal.timeout(TIMEOUT_MS),
			body: JSON.stringify({
				query,
				max_results: Math.min(Math.max(options.maxResults ?? 5, 1), 20),
				...(options.tag ? { tag: options.tag } : {}),
				...(options.params ? { params: options.params } : {}),
				...(options.zone ? { zone: options.zone } : {}),
				...(options.language ? { language: options.language } : {}),
				...(options.format ? { format: options.format } : {}),
			}),
		});

		if (!response.ok)
			return { ok: false, reason: await describeFailure(response) };

		const body = (await response.json()) as {
			code?: unknown;
			message?: unknown;
			request_id?: unknown;
			data?: { results?: unknown };
		};
		if (typeof body.code === "number" && body.code !== 0) {
			return {
				ok: false,
				reason: text(body.message) || "AnySearch returned an error.",
			};
		}
		const sources = Array.isArray(body.data?.results)
			? body.data.results.flatMap((value) => {
					const parsed = source(value);
					return parsed ? [parsed] : [];
				})
			: [];

		if (sources.length === 0)
			return { ok: false, reason: "No search results." };

		return {
			ok: true,
			data: {
				sources,
				citations: [...new Set(sources.map((item) => item.url))],
				requestId: text(body.request_id) || null,
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

async function describeFailure(response: Response): Promise<string> {
	const raw = await response.text();
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		body = null;
	}

	if (body && typeof body === "object" && !Array.isArray(body)) {
		const row = body as Record<string, unknown>;
		const message = text(row.message);
		const requestId = text(row.request_id);
		if (message || requestId) {
			return [
				`HTTP ${response.status}`,
				message,
				requestId ? `request ${requestId}` : "",
			]
				.filter(Boolean)
				.join(" — ");
		}
	}

	return `HTTP ${response.status}`;
}

export async function findPersonProfileCandidates(
	name: string,
	companyName?: string,
	title?: string,
): Promise<AnySearchSource[]> {
	const query = [
		`Find the LinkedIn profile for "${name}"`,
		companyName ? `who works at ${companyName}` : "",
		title ? `and has the title ${title}` : "",
	]
		.filter(Boolean)
		.join(" ");
	const answer = await search(query, { maxResults: 5 });
	if (!answer.ok) return [];

	return answer.data.sources.filter((item) => {
		try {
			const host = new URL(item.url).hostname.toLowerCase();
			return host === "linkedin.com" || host.endsWith(".linkedin.com");
		} catch {
			return false;
		}
	});
}
