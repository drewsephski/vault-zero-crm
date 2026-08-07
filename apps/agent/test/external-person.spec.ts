import { describe, expect, it } from "bun:test";
import { looksLikePersonSearch } from "../agent/lib/external-person";

describe("automatic external person discovery", () => {
	it("recognizes a missing full-name lookup as a person search", () => {
		expect(looksLikePersonSearch("Drew Sepeczi")).toBe(true);
	});

	it("does not send domains or email addresses to person discovery", () => {
		expect(looksLikePersonSearch("squidagent.app")).toBe(false);
		expect(looksLikePersonSearch("drew@squidagent.app")).toBe(false);
	});

	it("respects an explicit company or deal-only search", () => {
		expect(looksLikePersonSearch("Squid Agent", ["company"])).toBe(false);
		expect(looksLikePersonSearch("Renewal", ["deal"])).toBe(false);
	});

	it("allows an explicitly narrowed contact search", () => {
		expect(looksLikePersonSearch("Drew", ["contact"])).toBe(true);
	});
});
