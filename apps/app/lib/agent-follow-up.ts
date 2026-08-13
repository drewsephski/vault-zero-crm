import type { TranscriptMessage } from "./agent-transcript";

export type FollowUpContextMessage = {
	role: "user" | "assistant";
	content: string;
};

export type FollowUpPrompt = {
	label: string;
	prompt: string;
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

const LEADING_QUESTION =
	/^(?:should i|would you like me to|do you want me to|want me to|shall i|could i)\s+/i;
const PURPOSE_CLAUSE =
	/\s+to\s+(?:identify|see|find|help|learn|understand|prepare|check)\b/i;
const MAX_LABEL_LENGTH = 48;

function clipLabel(value: string): string {
	const clean = value
		.trim()
		.replace(LEADING_QUESTION, "")
		.split(PURPOSE_CLAUSE, 1)[0]
		?.replace(/[?.!,;:]+$/, "")
		.trim();
	if (!clean) return "Continue research";

	const sentence = clean[0]?.toUpperCase() + clean.slice(1);
	if (sentence.length <= MAX_LABEL_LENGTH) return sentence;

	const clipped = sentence.slice(0, MAX_LABEL_LENGTH + 1);
	const boundary = clipped.lastIndexOf(" ");
	return clipped.slice(0, boundary > 20 ? boundary : MAX_LABEL_LENGTH).trim();
}

function readPrompt(value: unknown): FollowUpPrompt | null {
	if (typeof value === "string") {
		const prompt = value.trim().slice(0, 180);
		return prompt ? { label: clipLabel(prompt), prompt } : null;
	}

	if (!value || typeof value !== "object") return null;
	const item = value as { label?: unknown; prompt?: unknown };
	if (typeof item.label !== "string" || typeof item.prompt !== "string") {
		return null;
	}

	const prompt = item.prompt.trim().slice(0, 180);
	if (!prompt) return null;

	return {
		label: clipLabel(item.label),
		prompt,
	};
}

export function readFollowUpPrompts(value: unknown): FollowUpPrompt[] {
	if (!value || typeof value !== "object" || !("prompts" in value)) return [];

	const prompts = (value as { prompts?: unknown }).prompts;
	if (!Array.isArray(prompts)) return [];

	const seen = new Set<string>();
	return prompts
		.map(readPrompt)
		.filter((item): item is FollowUpPrompt => {
			if (!item || seen.has(item.prompt)) return false;
			seen.add(item.prompt);
			return true;
		})
		.slice(0, 3);
}
