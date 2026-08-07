import type { CarbonIcon } from "@crm/ui/components/icon";

export type AgentRecordKind = "contact" | "company" | "deal";

export type AgentRecord = { kind: AgentRecordKind; id: string };

export type AgentScope = AgentRecord | { kind: "workspace" };

export type AgentScopeKind = AgentScope["kind"];

type ScopeCopy = {
	title: string;
	blurb: string;
	placeholder: string;
	suggestions: string[];
};

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
		"What research is waiting?",
		"Find a company or person",
		"Research someone outside the CRM",
		"What can you help me with?",
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
			"Who is this person?",
			"Are they still there?",
			"What should I know before a call?",
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
			"What do they do?",
			"Who do we know here?",
			"What has changed recently?",
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
			"Where does this stand?",
			"Who else should be involved?",
			"What is the risk here?",
		],
	},
};

export function recordCopy(kind: AgentScopeKind) {
	return kind === "workspace" ? WORKSPACE_COPY : RECORD_COPY[kind];
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
