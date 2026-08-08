import type { AgentScopeKind } from "./agent-record";
import type { TranscriptMessage } from "./agent-transcript";

type PromptCandidate = {
	text: string;
	terms: readonly string[];
};

const CANDIDATES: Record<AgentScopeKind, readonly PromptCandidate[]> = {
	workspace: [
		{
			text: "Which records need attention next?",
			terms: ["attention", "outstanding", "waiting", "priority", "risk"],
		},
		{
			text: "What should I follow up on?",
			terms: [
				"follow",
				"email",
				"meeting",
				"call",
				"deal",
				"contact",
				"company",
			],
		},
		{
			text: "Can you summarize the key takeaway?",
			terms: ["summary", "found", "research", "looked", "read", "overview"],
		},
		{
			text: "What changed recently?",
			terms: ["change", "recent", "moved", "left", "new"],
		},
		{
			text: "Find the next person or company to research",
			terms: ["person", "company", "research", "outside"],
		},
	],
	contact: [
		{
			text: "What should I do next with this person?",
			terms: ["next", "recommend", "action", "follow", "priority"],
		},
		{
			text: "What else should we verify about them?",
			terms: [
				"verify",
				"source",
				"evidence",
				"uncertain",
				"research",
				"profile",
			],
		},
		{
			text: "Can you summarize our history with them?",
			terms: ["history", "email", "meeting", "conversation", "thread"],
		},
		{
			text: "Are they still at the company?",
			terms: ["current", "role", "employer", "changed", "left", "moved"],
		},
		{
			text: "What should I know before a call?",
			terms: ["call", "meeting", "prepare", "before", "history"],
		},
	],
	company: [
		{
			text: "What should we do next with this company?",
			terms: ["next", "recommend", "action", "follow", "priority"],
		},
		{
			text: "What changed recently at this company?",
			terms: ["change", "recent", "moved", "launched", "news", "new"],
		},
		{
			text: "Who should we contact next?",
			terms: ["contact", "person", "team", "decision", "linkedin"],
		},
		{
			text: "What is the biggest risk here?",
			terms: ["risk", "stalled", "concern", "missing", "uncertain"],
		},
		{
			text: "Can you summarize our history with them?",
			terms: ["history", "email", "meeting", "conversation", "thread"],
		},
	],
	deal: [
		{
			text: "What should happen next on this deal?",
			terms: ["next", "action", "stage", "follow", "priority"],
		},
		{
			text: "What is the biggest risk right now?",
			terms: ["risk", "stalled", "concern", "missing", "uncertain"],
		},
		{
			text: "Who should we involve next?",
			terms: ["contact", "person", "stakeholder", "decision", "team"],
		},
		{
			text: "Can you summarize the deal history?",
			terms: ["history", "email", "meeting", "thread", "conversation"],
		},
		{
			text: "What evidence supports the current stage?",
			terms: ["evidence", "source", "stage", "confidence", "verify"],
		},
	],
};

const MAX_PROMPTS = 3;

export function followUpPrompts({
	kind,
	messages,
}: {
	kind: AgentScopeKind;
	messages: readonly TranscriptMessage[];
}): string[] {
	const latest = messages.at(-1);
	if (!latest || latest.mine) return [];

	const context = messages
		.flatMap((message) => message.items)
		.map((item) => (item.kind === "said" ? item.text : item.label))
		.join(" ")
		.toLowerCase();
	const words = new Set(context.match(/[a-z0-9]+/g) ?? []);

	return CANDIDATES[kind]
		.map((candidate, index) => ({
			candidate,
			index,
			score: candidate.terms.reduce(
				(score, term) => score + (words.has(term) ? 1 : 0),
				0,
			),
		}))
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.slice(0, MAX_PROMPTS)
		.map(({ candidate }) => candidate.text);
}
