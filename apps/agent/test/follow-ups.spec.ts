import { describe, expect, it } from "bun:test";
import {
	followUpPrompt,
	followUpRequestSchema,
	followUpResponseSchema,
} from "../agent/lib/follow-ups";

describe("follow-up generation", () => {
	it("builds a scoped prompt from the recent transcript", () => {
		const input = followUpRequestSchema.parse({
			scope: "deal",
			messages: [
				{ role: "user", content: "Where is this stalled?" },
				{ role: "assistant", content: "The decision maker has not replied." },
			],
		});

		const prompt = followUpPrompt(input);

		expect(prompt).toContain("one deal");
		expect(prompt).toContain("Rep: Where is this stalled?");
		expect(prompt).toContain("Agent: The decision maker has not replied.");
	});

	it("bounds untrusted context", () => {
		const result = followUpRequestSchema.safeParse({
			scope: "company",
			messages: Array.from({ length: 9 }, () => ({
				role: "assistant",
				content: "A",
			})),
		});

		expect(result.success).toBe(false);
	});

	it("keeps button labels separate from the message sent", () => {
		expect(
			followUpResponseSchema.parse({
				prompts: [
					{
						label: "Check recent company news",
						prompt:
							"Research recent company news for changes that matter before the call.",
					},
				],
			}),
		).toEqual({
			prompts: [
				{
					label: "Check recent company news",
					prompt:
						"Research recent company news for changes that matter before the call.",
				},
			],
		});
	});
});
