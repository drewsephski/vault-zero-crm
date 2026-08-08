import type { TranscriptMessage } from "./agent-transcript";

export type FollowUpContextMessage = {
	role: "user" | "assistant";
	content: string;
};

const MAX_CONTEXT_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 3000;

export function followUpContext(
	messages: readonly TranscriptMessage[],
): FollowUpContextMessage[] {
	return messages
		.slice(-MAX_CONTEXT_MESSAGES)
		.map((message) => ({
			role: message.mine ? ("user" as const) : ("assistant" as const),
			content: message.items
				.map((item) => {
					if (item.kind === "said") return item.text;
					const sources = item.sources.map((source) => source.title).join(", ");
					return sources ? `${item.label} (${sources})` : item.label;
				})
				.join("\n")
				.trim()
				.slice(0, MAX_MESSAGE_LENGTH),
		}))
		.filter((message) => message.content.length > 0);
}

export function readFollowUpPrompts(value: unknown): string[] {
	if (!value || typeof value !== "object" || !("prompts" in value)) return [];

	const prompts = (value as { prompts?: unknown }).prompts;
	if (!Array.isArray(prompts)) return [];

	return [
		...new Set(
			prompts
				.filter((prompt): prompt is string => typeof prompt === "string")
				.map((prompt) => prompt.trim())
				.filter(Boolean)
				.map((prompt) => prompt.slice(0, 180)),
		),
	].slice(0, 3);
}
