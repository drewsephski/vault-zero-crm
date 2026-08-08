import { describe, expect, it } from "bun:test";
import { followUpPrompts } from "../lib/agent-follow-up";
import type { TranscriptMessage } from "../lib/agent-transcript";

const assistant = (text: string): TranscriptMessage => ({
	id: "assistant",
	mine: false,
	items: [{ kind: "said", id: "said", mine: false, text }],
});

describe("follow-up prompts", () => {
	it("returns no prompts before the agent has answered", () => {
		expect(
			followUpPrompts({
				kind: "company",
				messages: [{ id: "user", mine: true, items: [] }],
			}),
		).toEqual([]);
	});

	it("prioritizes prompts that match the conversation context", () => {
		expect(
			followUpPrompts({
				kind: "deal",
				messages: [
					assistant(
						"The deal is stalled and the biggest risk is a missing decision maker.",
					),
				],
			}),
		).toEqual([
			"What is the biggest risk right now?",
			"Who should we involve next?",
			"What should happen next on this deal?",
		]);
	});

	it("keeps prompts scoped to the record type", () => {
		const prompts = followUpPrompts({
			kind: "contact",
			messages: [assistant("I found their current role and LinkedIn profile.")],
		});

		expect(prompts).toContain("What else should we verify about them?");
		expect(prompts.join(" ")).not.toContain("deal");
	});
});
