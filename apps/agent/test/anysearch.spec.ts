import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { search } from "../agent/lib/anysearch";

const realFetch = globalThis.fetch;
const realKey = process.env.ANYSEARCH_API_KEY;

let requests: Array<{ url: string; init: RequestInit | undefined }> = [];

beforeEach(() => {
	requests = [];
	process.env.ANYSEARCH_API_KEY = "any-test";
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (realKey === undefined) delete process.env.ANYSEARCH_API_KEY;
	else process.env.ANYSEARCH_API_KEY = realKey;
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

describe("AnySearch", () => {
	it("normalizes the documented response and bounds results", async () => {
		stub({
			request_id: "request-1",
			data: {
				results: [
					{
						title: "Acme filing",
						url: "https://example.com/acme",
						snippet: "Acme filed an update.",
					},
					{ title: "Unsafe", url: "javascript:alert(1)" },
				],
			},
		});

		const result = await search("Acme update", {
			maxResults: 99,
			tag: "business.company",
			params: { country: "US" },
		});

		expect(result).toEqual({
			ok: true,
			data: {
				requestId: "request-1",
				citations: ["https://example.com/acme"],
				sources: [
					{
						title: "Acme filing",
						url: "https://example.com/acme",
						content: "Acme filed an update.",
						score: null,
					},
				],
			},
		});
		expect(requests[0]?.url).toBe("https://api.anysearch.com/v1/search");
		expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
			query: "Acme update",
			max_results: 20,
			tag: "business.company",
			params: { country: "US" },
		});
	});

	it("does not call the network without a key", async () => {
		delete process.env.ANYSEARCH_API_KEY;
		stub({ data: { results: [] } });

		expect(await search("Acme")).toEqual({
			ok: false,
			reason: "No ANYSEARCH_API_KEY.",
		});
		expect(requests).toHaveLength(0);
	});

	it("surfaces structured provider failures", async () => {
		stub(
			{
				message: "Quota exhausted",
				request_id: "request-2",
			},
			402,
		);

		expect(await search("Acme")).toEqual({
			ok: false,
			reason: "HTTP 402 — Quota exhausted — request request-2",
		});
	});
});
