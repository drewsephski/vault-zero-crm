import { describe, expect, it } from "bun:test";
import { search } from "../agent/lib/context-dev";

describe("Context.dev discovery compatibility", () => {
	it("does not call the retired web search endpoint", async () => {
		expect(await search("Acme funding")).toEqual({
			outcome: "failed",
			reason:
				"Context.dev web search is retired. Use AnySearch or Tavily for discovery, or research_company for a known company website.",
		});
	});
});
