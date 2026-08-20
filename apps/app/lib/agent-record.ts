import type { CarbonIcon } from "@crm/ui/components/icon";

export type AgentRecordKind = "contact" | "company" | "deal";

export type AgentRecord = { kind: AgentRecordKind; id: string };

export type AgentScope = AgentRecord | { kind: "workspace" };

export type AgentScopeKind = AgentScope["kind"];

export type AgentSuggestion = {
	label: string;
	prompt: string;
};

type ScopeCopy = {
	title: string;
	blurb: string;
	placeholder: string;
	suggestions: AgentSuggestion[];
};

function suggestion(label: string, prompt = label): AgentSuggestion {
	return { label, prompt };
}

type RecordCopy = ScopeCopy & {
	header: string;
	field: "contactId" | "companyId" | "dealId";
};

const WORKSPACE_COPY: ScopeCopy = {
	title: "Ask across your CRM",
	blurb:
		"Find any contact, company or deal, and see what research needs attention.",
	placeholder: "What needs attention?",
	suggestions: [
		suggestion("What research is waiting?"),
		suggestion("Find a company or person"),
		suggestion("Research someone outside the CRM"),
		suggestion("What can you help me with?"),
	],
};

const ACQUISITION_WORKSPACE_COPY: ScopeCopy = {
	title: "Ask across your acquisitions",
	blurb:
		"Screen targets against the buy box, find research gaps, and decide what needs attention next.",
	placeholder: "What should I work on next?",
	suggestions: [
		suggestion(
			"Best buy-box fits",
			"Which targets in our pipeline best match the saved buy box, and what evidence supports each fit?",
		),
		suggestion(
			"What needs attention?",
			"What acquisition targets or opportunities need my attention right now, and what should I do next?",
		),
		suggestion(
			"Missing research",
			"Which targets are missing research or have incomplete diligence that I should prioritize?",
		),
		suggestion(
			"Compare opportunities",
			"Compare our top acquisition opportunities and highlight the key differences in fit, risk, and readiness.",
		),
	],
};

const RECORD_COPY: Record<AgentRecordKind, RecordCopy> = {
	contact: {
		header: "x-crm-contact",
		field: "contactId",
		title: "Ask about this person",
		blurb:
			"Every step is shown as it happens — including the leads it throws away.",
		placeholder: "Are they still there?",
		suggestions: [
			suggestion("Who is this person?"),
			suggestion("Are they still there?"),
			suggestion("What should I know before a call?"),
		],
	},
	company: {
		header: "x-crm-company",
		field: "companyId",
		title: "Ask about this company",
		blurb:
			"It reads their site and our own history with them, and shows its working.",
		placeholder: "What do they sell?",
		suggestions: [
			suggestion("What do they do?"),
			suggestion("Who do we know here?"),
			suggestion("What has changed recently?"),
		],
	},
	deal: {
		header: "x-crm-deal",
		field: "dealId",
		title: "Ask about this deal",
		blurb:
			"It can read the thread, the meetings and the people on both sides of it.",
		placeholder: "Where has this stalled?",
		suggestions: [
			suggestion("Where does this stand?"),
			suggestion("Who else should be involved?"),
			suggestion("What is the risk here?"),
		],
	},
};

const ACQUISITION_RECORD_COPY: Partial<Record<AgentRecordKind, RecordCopy>> = {
	company: {
		...RECORD_COPY.company,
		title: "Ask about this target",
		blurb:
			"It compares public evidence and CRM history with the saved buy box without filling unknowns with guesses.",
		placeholder: "Does this fit the buy box?",
		suggestions: [
			suggestion("Does this target fit the buy box?"),
			suggestion("What is verified and still unknown?"),
			suggestion("What are the biggest risks?"),
			suggestion("Prepare me for an owner call"),
		],
	},
	deal: {
		...RECORD_COPY.deal,
		title: "Ask about this opportunity",
		blurb:
			"It reads the history, people, and evidence behind this acquisition opportunity.",
		placeholder: "What could stop this acquisition?",
		suggestions: [
			suggestion("What are the biggest risks?"),
			suggestion("What diligence is still missing?"),
			suggestion("What should we ask for before an NDA?"),
			suggestion("What is the next decision?"),
		],
	},
};

export function recordCopy(kind: AgentScopeKind, acquisition = false) {
	if (kind === "workspace") {
		return acquisition ? ACQUISITION_WORKSPACE_COPY : WORKSPACE_COPY;
	}
	return acquisition
		? (ACQUISITION_RECORD_COPY[kind] ?? RECORD_COPY[kind])
		: RECORD_COPY[kind];
}

export function recordHeader(scope: AgentScope): Record<string, string> {
	if (scope.kind === "workspace") return {};
	return { [RECORD_COPY[scope.kind].header]: scope.id };
}

export function recordFilter(scope: AgentScope): {
	scope?: "workspace";
	contactId?: string;
	companyId?: string;
	dealId?: string;
} {
	if (scope.kind === "workspace") return { scope: "workspace" };
	return { [RECORD_COPY[scope.kind].field]: scope.id };
}

export type { CarbonIcon };
