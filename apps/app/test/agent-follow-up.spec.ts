import { describe, expect, it } from "bun:test";
import { followUpContext, readFollowUpPrompts } from "../lib/agent-follow-up";
import type { TranscriptMessage } from "../lib/agent-transcript";

const assistant = (text: string): TranscriptMessage => ({
	id: "assistant",
	mine: false,
	items: [{ kind: "said", id: "said", mine: false, text }],
});

describe("follow-up context", () => {
	it("keeps recent user and agent context in model-ready form", () => {
		expect(
			followUpContext([
				{
					id: "old",
					mine: true,
					items: [{ kind: "said", id: "old", mine: true, text: "Old" }],
				},
				assistant("The deal is stalled and the decision maker is missing."),
			]),
		).toEqual([
			{ role: "user", content: "Old" },
			{
				role: "assistant",
				content: "The deal is stalled and the decision maker is missing.",
			},
		]);
	});

	it("validates model output without inventing a fallback", () => {
		expect(
			readFollowUpPrompts({
				prompts: [
					{
						label: "Check the decision maker",
						prompt: "Ask about the missing decision maker.",
					},
					"",
					3,
				],
			}),
		).toEqual([
			{
				label: "Check the decision maker",
				prompt: "Ask about the missing decision maker.",
			},
		]);
		expect(readFollowUpPrompts({ prompts: [] })).toEqual([]);
	});

	it("shortens legacy question-shaped labels without losing the prompt", () => {
		const prompt =
			"Should I research recent Occidental Petroleum press releases to identify potential pain points for a Production Engineer?";

		expect(readFollowUpPrompts({ prompts: [prompt] })).toEqual([
			{
				label: "Research recent Occidental Petroleum press",
				prompt,
			},
		]);
	});

	it("limits context to the recent conversation", () => {
		const messages = Array.from({ length: 10 }, (_, index) =>
			assistant(`Message ${index}`),
		);

		expect(followUpContext(messages)).toHaveLength(8);
		expect(followUpContext(messages)[0]?.content).toBe("Message 2");
	});
});
