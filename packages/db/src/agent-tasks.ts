import type { Db } from "./client";
import { Prisma } from "./generated/prisma/client";

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

export type QueueAgentTaskInput = {
	contactId?: string | null;
	companyId?: string | null;
	kind: string;
	reason: string;
	dueAt: Date;
	priority?: number;
	budget?: number;
};

export type QueueAgentTaskResult = {
	taskId: string;
	created: boolean;
	advanced: boolean;
};

export async function queueAgentTask(
	database: Db,
	input: QueueAgentTaskInput,
): Promise<QueueAgentTaskResult> {
	const subject = {
		contactId: input.contactId ?? null,
		companyId: input.companyId ?? null,
	};
	const existing = await database.agentTask.findFirst({
		where: { kind: input.kind, finishedAt: null, ...subject },
		select: { id: true, dueAt: true, startedAt: true },
	});

	if (existing) {
		const advanced = await advanceAgentTask(database, existing, input);
		return { taskId: existing.id, created: false, advanced };
	}

	try {
		const created = await database.agentTask.create({
			data: {
				...subject,
				kind: input.kind,
				reason: input.reason,
				dueAt: input.dueAt,
				priority: input.priority ?? 0,
				budget: input.budget ?? 4,
			},
			select: { id: true },
		});
		return { taskId: created.id, created: true, advanced: false };
	} catch (error) {
		if (!isUniqueConflict(error)) throw error;

		const winner = await database.agentTask.findFirst({
			where: { kind: input.kind, finishedAt: null, ...subject },
			select: { id: true, dueAt: true, startedAt: true },
		});
		if (!winner) throw error;

		const advanced = await advanceAgentTask(database, winner, input);
		return { taskId: winner.id, created: false, advanced };
	}
}

async function advanceAgentTask(
	database: Db,
	existing: { id: string; dueAt: Date; startedAt: Date | null },
	input: QueueAgentTaskInput,
): Promise<boolean> {
	if (existing.startedAt || existing.dueAt.getTime() <= input.dueAt.getTime()) {
		return false;
	}

	const { count } = await database.agentTask.updateMany({
		where: {
			id: existing.id,
			finishedAt: null,
			startedAt: null,
			dueAt: { gt: input.dueAt },
		},
		data: {
			dueAt: input.dueAt,
			reason: input.reason,
			priority: input.priority ?? 0,
			budget: input.budget ?? 4,
		},
	});

	return count === 1;
}

function isUniqueConflict(
	error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}
