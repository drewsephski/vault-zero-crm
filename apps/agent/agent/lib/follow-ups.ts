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

const FOLLOW_UP_OUTPUT = z.object({
	prompts: z.array(z.string().trim().min(1).max(180)).min(1).max(3),
});

const SCOPE_LABELS: Record<FollowUpRequest["scope"], string> = {
	workspace: "the whole CRM",
	contact: "one contact",
	company: "one company",
	deal: "one deal",
};

const SYSTEM = `You write suggested follow-up messages for a CRM research agent.

Return three short, distinct prompts that the rep could send next. Make them genuinely useful continuations of the conversation, grounded in the evidence and open questions in the transcript. Prefer concrete next actions, missing verification, decisions, risks, or useful summaries that follow from what was just discussed.

Do not answer the conversation. Do not mention that you are generating suggestions. Do not invent facts, names, goals, or actions that are not supported by the transcript. Avoid generic prompts such as "Tell me more" or "What else can you do?". Each prompt must stand on its own, be plain text, and be no longer than 140 characters.`;

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
): Promise<{ prompts: string[] }> {
	const { model } = await activeModel();
	const result = await generateText({
		model,
		system: SYSTEM,
		prompt: followUpPrompt(input),
		output: Output.object({ schema: FOLLOW_UP_OUTPUT }),
		maxOutputTokens: 400,
		maxRetries: 1,
		temperature: 0.4,
		timeout: { totalMs: 15_000 },
	});

	const prompts = [...new Set(result.output?.prompts ?? [])]
		.map((prompt) => prompt.trim())
		.filter(Boolean)
		.slice(0, 3);

	return { prompts };
}
