import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { searchPeople, slugFromLinkedinInput } from "../agent/lib/linkdapi";

const realFetch = globalThis.fetch;
const realKey = process.env.RAPIDAPI_KEY;

let requests: Array<{ url: string; init: RequestInit | undefined }> = [];

beforeEach(() => {
	requests = [];
	process.env.RAPIDAPI_KEY = "rapid-test";
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (realKey === undefined) delete process.env.RAPIDAPI_KEY;
	else process.env.RAPIDAPI_KEY = realKey;
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

function stubSequence(
	responses: {
		body: unknown;
		status: number;
		headers?: Record<string, string>;
	}[],
): void {
	let index = 0;
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		requests.push({ url: String(input), init });
		const response = responses[Math.min(index, responses.length - 1)];
		index += 1;
		if (!response) throw new Error("A response fixture is required.");

		return new Response(JSON.stringify(response.body), {
			status: response.status,
			headers: {
				"content-type": "application/json",
				...response.headers,
			},
		});
	}) as typeof fetch;
}

describe("LinkdAPI people search", () => {
	it("normalizes a LinkedIn URL or username to a profile slug", () => {
		expect(slugFromLinkedinInput("drew-sepeczi")).toBe("drew-sepeczi");
		expect(
			slugFromLinkedinInput("https://www.linkedin.com/in/drew-sepeczi/"),
		).toBe("drew-sepeczi");
		expect(slugFromLinkedinInput("https://example.com/in/drew")).toBeNull();
	});

	it("sends RapidAPI search filters and normalizes candidate profiles", async () => {
		stub({
			success: true,
			data: {
				people: [
					{
						username: "joe-sepeczi",
						fullName: "Joe Sepeczi",
						headline: "Founder at Acme",
						location: { city: "Chicago", region: "IL" },
						urn: "urn:joe",
					},
				],
			},
		});

		const result = await searchPeople({
			keyword: "Joe Sepeczi",
			currentCompany: "123",
			count: 5,
		});

		expect(result).toEqual({
			ok: true,
			data: [
				{
					slug: "joe-sepeczi",
					profileUrl: "https://www.linkedin.com/in/joe-sepeczi",
					fullName: "Joe Sepeczi",
					headline: "Founder at Acme",
					location: "Chicago",
					urn: "urn:joe",
					photoUrl: null,
				},
			],
		});

		const request = requests[0];
		expect(request?.url).toContain("/api/v1/search/people?");
		expect(request?.url).toContain("keyword=Joe+Sepeczi");
		expect(request?.url).toContain("currentCompany=123");
		expect(request?.url).toContain("count=5");
		expect(request?.init?.headers).toEqual({
			"x-rapidapi-host": "linkdapi-best-unofficial-linkedin-api.p.rapidapi.com",
			"x-rapidapi-key": "rapid-test",
		});
	});

	it("keeps URN-only results but refuses unidentifiable rows", async () => {
		stub({
			success: true,
			data: {
				people: [
					{ fullName: "Jane Doe", urn: "urn:jane" },
					{ fullName: "Not a profile" },
				],
			},
		});

		const result = await searchPeople({ keyword: "Jane Doe" });

		expect(result).toEqual({
			ok: true,
			data: [
				{
					slug: null,
					profileUrl: null,
					fullName: "Jane Doe",
					headline: null,
					location: null,
					urn: "urn:jane",
					photoUrl: null,
				},
			],
		});
	});

	it("does not accept a non-LinkedIn profile URL as a candidate", async () => {
		stub({
			success: true,
			data: {
				people: [
					{
						profileUrl: "https://notlinkedin.com/in/jane",
						fullName: "Jane Doe",
					},
				],
			},
		});

		const result = await searchPeople({ keyword: "Jane Doe" });

		expect(result).toEqual({ ok: true, data: [] });
	});

	it("retries one short provider throttle after Retry-After", async () => {
		process.env.RAPIDAPI_KEY = "rapid-short-throttle";
		stubSequence([
			{
				body: { message: "Too many requests" },
				status: 429,
				headers: { "retry-after": "0" },
			},
			{
				body: { success: true, data: { people: [] } },
				status: 200,
			},
		]);

		const result = await searchPeople({ keyword: "Jane Doe" });

		expect(result).toEqual({ ok: true, data: [] });
		expect(requests).toHaveLength(2);
	});

	it("does not retry a provider limit without reset headers", async () => {
		process.env.RAPIDAPI_KEY = "rapid-provider-limit-no-reset";
		stubSequence([
			{
				body: { message: "Too many requests" },
				status: 429,
			},
		]);

		const result = await searchPeople({ keyword: "Jane Doe" });

		expect(result).toMatchObject({
			ok: false,
			missing: false,
			code: "rate_limited",
			retryAfterSeconds: 60,
		});
		expect(requests).toHaveLength(1);
	});

	it("suppresses duplicate calls while a provider limit is active", async () => {
		process.env.RAPIDAPI_KEY = "rapid-provider-limit";
		stubSequence([
			{
				body: {
					message:
						"You have exceeded the rate limit per month for your BASIC plan.",
				},
				status: 429,
				headers: { "retry-after": "120" },
			},
		]);

		const first = await searchPeople({ keyword: "Jane Doe" });
		const second = await searchPeople({ keyword: "John Doe" });

		expect(first).toMatchObject({
			ok: false,
			missing: false,
			code: "rate_limited",
			retryAfterSeconds: 120,
		});
		expect(second).toMatchObject({
			ok: false,
			missing: false,
			code: "rate_limited",
		});
		if (!first.ok && !first.missing) {
			expect(first.reason).toContain("Retrying immediately will not help");
		}
		expect(requests).toHaveLength(1);
	});
});
