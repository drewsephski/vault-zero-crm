import { generateText, Output } from "ai";
import { z } from "zod";
import { activeModel } from "./model";

export const followUpRequestSchema = z.object({
	scope: z.enum(["workspace", "contact", "company", "deal"]),
	messages: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string().trim().min(1).max(3000),
			}),
		)
		.min(1)
		.max(8),
});

export type FollowUpRequest = z.infer<typeof followUpRequestSchema>;

export const followUpResponseSchema = z.object({
	prompts: z
		.array(
			z.object({
				label: z.string().trim().min(1).max(60),
				prompt: z.string().trim().min(1).max(180),
			}),
		)
		.min(1)
		.max(3),
});

const SCOPE_LABELS: Record<FollowUpRequest["scope"], string> = {
	workspace: "the whole CRM",
	contact: "one contact",
	company: "one company",
	deal: "one deal",
};

const SYSTEM = `You write suggested follow-up actions for a CRM research agent.

Return three distinct options that the rep could send next. Each option has a short label for a button and a complete prompt for the agent.

The label must be a verb-first action of 2 to 6 words and no more than 48 characters. Write "Check recent company news", not "Should I research recent company press releases?". Never start a label with "Should I", "Would you like me to", "Do you want me to", or similar framing.

The prompt must preserve the useful specifics and stand on its own when sent. Make every option a genuinely useful continuation grounded in the evidence and open questions in the transcript. Prefer concrete next actions, missing verification, decisions, risks, or useful summaries that follow from what was just discussed.

Do not answer the conversation. Do not mention that you are generating suggestions. Do not invent facts, names, goals, or actions that are not supported by the transcript. Avoid generic prompts such as "Tell me more" or "What else can you do?". Labels and prompts must be plain text. Each prompt must be no longer than 140 characters.`;

export function followUpPrompt(input: FollowUpRequest): string {
	const transcript = input.messages
		.map(
			(message) =>
				`${message.role === "user" ? "Rep" : "Agent"}: ${message.content}`,
		)
		.join("\n\n");

	return `The conversation is about ${SCOPE_LABELS[input.scope]}.

Recent conversation:
${transcript}`;
}

export async function generateFollowUps(
	input: FollowUpRequest,
): Promise<z.infer<typeof followUpResponseSchema>> {
	const { model } = await activeModel();
	const result = await generateText({
		model,
		system: SYSTEM,
		prompt: followUpPrompt(input),
		output: Output.object({ schema: followUpResponseSchema }),
		maxOutputTokens: 400,
		maxRetries: 1,
		temperature: 0.4,
		timeout: { totalMs: 15_000 },
	});

	const seen = new Set<string>();
	const prompts = (result.output?.prompts ?? [])
		.map(({ label, prompt }) => ({
			label: label.trim(),
			prompt: prompt.trim(),
		}))
		.filter(({ label, prompt }) => {
			if (!label || !prompt || seen.has(prompt)) return false;
			seen.add(prompt);
			return true;
		})
		.slice(0, 3);

	return { prompts };
}
