import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	ask,
	findPersonProfileCandidates,
	findProfileUrls,
} from "../agent/lib/tavily";

const realFetch = globalThis.fetch;
const realKey = process.env.TAVILY_API_KEY;

let requests: Array<{ url: string; init: RequestInit | undefined }> = [];

beforeEach(() => {
	requests = [];
	process.env.TAVILY_API_KEY = "tvly-test";
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (realKey === undefined) delete process.env.TAVILY_API_KEY;
	else process.env.TAVILY_API_KEY = realKey;
});

function stub(body: unknown, status = 200): void {
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		requests.push({ url: String(input), init });
		return new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

describe("Tavily search", () => {
	it("treats a missing key as an unavailable capability", async () => {
		delete process.env.TAVILY_API_KEY;
		stub({ results: [] });

		expect(await ask("Acme funding")).toEqual({
			ok: false,
			reason: "No TAVILY_API_KEY.",
		});
		expect(requests).toHaveLength(0);
	});

	it("returns normalized source excerpts and sends bounded options", async () => {
		stub({
			results: [
				{
					title: "Acme raises a Series A",
					url: "https://example.com/acme",
					content: "Acme raised $10 million.",
					score: 0.9,
				},
				{ title: "Unsafe", url: "javascript:alert(1)", content: "no" },
			],
		});

		const result = await ask("Acme funding", {
			depth: "advanced",
			domains: ["example.com"],
			maxResults: 99,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.citations).toEqual(["https://example.com/acme"]);
			expect(result.data.sources).toHaveLength(1);
			expect(result.data.text).toContain("Acme raised $10 million.");
		}

		expect(requests[0]?.url).toBe("https://api.tavily.com/search");
		expect(requests[0]?.init?.headers).toEqual({
			authorization: "Bearer tvly-test",
			"content-type": "application/json",
		});
		expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
			query: "Acme funding",
			search_depth: "advanced",
			max_results: 10,
			topic: "general",
			include_answer: false,
			include_raw_content: false,
			include_domains: ["example.com"],
		});
	});

	it("returns provider failures instead of throwing", async () => {
		stub({ detail: "rate limited" }, 429);
		expect(await ask("Acme")).toEqual({ ok: false, reason: "HTTP 429" });
	});

	it("extracts a LinkedIn profile slug from restricted search results", async () => {
		stub({
			results: [
				{
					title: "Drew on LinkedIn",
					url: "https://www.linkedin.com/in/drew-example",
					content: "Drew works at Acme.",
				},
			],
		});

		expect(await findProfileUrls(["Drew"], "Acme")).toEqual(["drew-example"]);
		expect(JSON.parse(String(requests[0]?.init?.body)).include_domains).toEqual(
			["linkedin.com"],
		);
	});

	it("finds named LinkedIn profile candidates through Tavily", async () => {
		stub({
			results: [
				{
					title: "Drew Sepeczi | LinkedIn",
					url: "https://www.linkedin.com/in/drew-sepeczi",
					content: "Software Engineer at Squid Agent",
					score: 0.8,
				},
			],
		});

		expect(
			await findPersonProfileCandidates("Drew Sepeczi", "Squid Agent"),
		).toEqual([
			{
				slug: "drew-sepeczi",
				profileUrl: "https://www.linkedin.com/in/drew-sepeczi",
				title: "Drew Sepeczi | LinkedIn",
				content: "Software Engineer at Squid Agent",
				score: 0.8,
			},
		]);
		expect(JSON.parse(String(requests[0]?.init?.body)).query).toContain(
			"Drew Sepeczi",
		);
	});
});
