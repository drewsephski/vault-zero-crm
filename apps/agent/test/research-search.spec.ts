import { describe, expect, it } from "bun:test";
import { plannedProviders } from "../agent/lib/research-search";

describe("research provider routing", () => {
	it("uses AnySearch for a fast general lookup", () => {
		expect(
			plannedProviders(
				{ intent: "general", deep: false },
				{ anysearch: true, tavily: true },
			),
		).toEqual(["anysearch"]);
	});

	it("uses Tavily first for deep current research", () => {
		expect(
			plannedProviders(
				{ intent: "current", deep: true },
				{ anysearch: true, tavily: true },
			),
		).toEqual(["tavily", "anysearch"]);
	});

	it("falls back when the preferred provider is unavailable", () => {
		expect(
			plannedProviders(
				{ intent: "general", deep: false },
				{ anysearch: false, tavily: true },
			),
		).toEqual(["tavily"]);
	});

	it("keeps vertical research on AnySearch", () => {
		expect(
			plannedProviders(
				{
					intent: "vertical",
					tag: "business.company",
					params: { country: "US" },
					deep: true,
				},
				{ anysearch: true, tavily: true },
			),
		).toEqual(["anysearch"]);
	});

	it("does not plan the retired Context.dev discovery provider", () => {
		expect(
			plannedProviders(
				{ providers: ["context"], deep: true },
				{ anysearch: true, tavily: true },
			),
		).toEqual([]);
	});
});
