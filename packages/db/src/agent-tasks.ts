export const TASK_KINDS = [
	"brand",
	"portrait",
	"meeting-prep",
	"identify",
	"profile",
	"recheck",
	"company-details",
	"company-profile",
	"acquisition-discovery",
	"acquisition-refresh",
	"workspace-profile",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export const DIRECT_KINDS = ["brand", "portrait"] as const;

export type DirectKind = (typeof DIRECT_KINDS)[number];

export function isDirectKind(kind: string): kind is DirectKind {
	return (DIRECT_KINDS as readonly string[]).includes(kind);
}

export const MAX_ATTEMPTS = 3;

export const RETRYING_OUTCOME_PREFIX = "retrying:";

type AgentTaskStateInput = {
	dueAt: Date;
	startedAt: Date | null;
	finishedAt: Date | null;
	outcome: string | null;
	lastError: string | null;
};

export function agentTaskState(
	task: AgentTaskStateInput | null,
	now = new Date(),
): {
	status: "idle" | "queued" | "running" | "retrying" | "failed";
	error: string | null;
} {
	if (!task) return { status: "idle", error: null };
	if (task.finishedAt) {
		return task.lastError
			? { status: "failed", error: task.lastError }
			: { status: "idle", error: null };
	}
	if (task.outcome?.startsWith(RETRYING_OUTCOME_PREFIX)) {
		return { status: "retrying", error: task.lastError };
	}
	if (task.startedAt) return { status: "running", error: null };
	if (task.dueAt.getTime() > now.getTime()) {
		return { status: "idle", error: null };
	}
	return { status: "queued", error: null };
}

export const RETIRED_OUTCOME = `Gave up after ${MAX_ATTEMPTS} attempts: the session never reported back.`;

export const PRIORITY = {
	brand: 900,
	portrait: 800,
	workspace: 500,
	requested: 300,
	meeting: 200,
	identify: 100,
	sweep: 50,
	companyProfile: 40,
	companyDetails: 40,
	acquisitionDiscovery: 250,
	acquisitionRefresh: 30,
	recheck: 0,
} as const;
