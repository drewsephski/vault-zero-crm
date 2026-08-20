import { db, Prisma } from "@crm/db";
import {
	ACQUISITION_TASK_INTERVAL_MS,
	ACQUISITION_TASK_KINDS,
} from "@crm/db/acquisition";
import {
	MAX_ATTEMPTS,
	type QueueAgentTaskInput,
	queueAgentTask,
	RETIRED_OUTCOME,
	RETRYING_OUTCOME_PREFIX,
} from "@crm/db/agent-tasks";
import {
	failAcquisitionResearchRun,
	finalizeAcquisitionResearchRunOnTaskComplete,
} from "./acquisition-research-run";

export type LeasedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	requestedById?: string | null;
	organizationId: string;
	kind: string;
	reason: string;
	budget: number;
	attempts: number;
	priority: number;
	dueAt: Date;
};

export type TaskSubject = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	kind: string;
};

const LEASE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 30_000;

export { DIRECT_KINDS, MAX_ATTEMPTS } from "@crm/db/agent-tasks";

export async function claimDue(
	limit: number,
	kinds: { only: readonly string[] } | { except: readonly string[] },
	leaseMs = LEASE_MS,
): Promise<LeasedTask[]> {
	const now = new Date();
	const until = new Date(now.getTime() + leaseMs);

	const list = "only" in kinds ? kinds.only : kinds.except;
	if ("only" in kinds && list.length === 0) return [];

	const claimed =
		"only" in kinds
			? await db.$queryRaw<LeasedTask[]>`
		UPDATE "agentTask" AS t
			SET "leasedUntil" = ${until},
			"startedAt" = COALESCE(t."startedAt", ${now}),
			"attempts" = t."attempts" + 1,
			"outcome" = NULL
		FROM (
			SELECT t2.id FROM "agentTask" AS t2
			WHERE t2."finishedAt" IS NULL
				AND t2."dueAt" <= ${now}
				AND (t2."leasedUntil" IS NULL OR t2."leasedUntil" < ${now})
				AND t2."attempts" < ${MAX_ATTEMPTS}
				AND t2.kind IN (${Prisma.join(list)})
			ORDER BY t2."priority" DESC, t2."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		) AS due
		WHERE t.id = due.id
		RETURNING t.id, t."contactId", t."companyId", t."requestedById", t."organizationId", t.kind, t.reason,
			t.budget, t.attempts, t.priority, t."dueAt";
	`
			: await db.$queryRaw<LeasedTask[]>`
		UPDATE "agentTask" AS t
		SET "leasedUntil" = ${until},
			"startedAt" = COALESCE(t."startedAt", ${now}),
			"attempts" = t."attempts" + 1,
			"outcome" = NULL
		FROM (
			SELECT t2.id FROM "agentTask" AS t2
			WHERE t2."finishedAt" IS NULL
				AND t2."dueAt" <= ${now}
				AND (t2."leasedUntil" IS NULL OR t2."leasedUntil" < ${now})
				AND t2."attempts" < ${MAX_ATTEMPTS}
				AND t2.kind NOT IN (${Prisma.join(list)})
			ORDER BY t2."priority" DESC, t2."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		) AS due
		WHERE t.id = due.id
		RETURNING t.id, t."contactId", t."companyId", t."requestedById", t."organizationId", t.kind, t.reason,
			t.budget, t.attempts, t.priority, t."dueAt";
	`;

	return claimed.sort(
		(a, b) => b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime(),
	);
}

export async function retireExhausted(): Promise<TaskSubject[]> {
	const now = new Date();

	const retired = await db.$queryRaw<TaskSubject[]>`
		UPDATE "agentTask" AS t
		SET "finishedAt" = ${now},
			"outcome" = ${RETIRED_OUTCOME},
			"lastError" = ${RETIRED_OUTCOME}
		WHERE t."finishedAt" IS NULL
			AND t."attempts" >= ${MAX_ATTEMPTS}
			AND (t."leasedUntil" IS NULL OR t."leasedUntil" < ${now})
		RETURNING t.id, t."contactId", t."companyId", t.kind;
	`;

	for (const task of retired) {
		if (task.kind === "acquisition-refresh") {
			await failAcquisitionResearchRun(task.id, RETIRED_OUTCOME);
		}
	}

	return retired;
}

export async function completeTask(
	taskId: string,
	outcome: string,
	sessionId?: string,
	options?: { skipResearchRunFinalization?: boolean },
): Promise<TaskSubject | null> {
	const now = new Date();

	return db.$transaction(async (tx) => {
		const { count } = await tx.agentTask.updateMany({
			where: { id: taskId, finishedAt: null, outcome: null },
			data: {
				finishedAt: now,
				outcome: outcome.slice(0, 500),
				lastError: null,
				...(sessionId ? { sessionId } : {}),
			},
		});

		if (count === 0) return null;

		const task = await tx.agentTask.findUnique({
			where: { id: taskId },
			select: {
				id: true,
				contactId: true,
				companyId: true,
				kind: true,
				reason: true,
				priority: true,
				budget: true,
			},
		});

		if (!task) return null;

		if (
			task.kind === "acquisition-refresh" &&
			!options?.skipResearchRunFinalization
		) {
			await finalizeAcquisitionResearchRunOnTaskComplete(taskId, tx);
		}

		if (isAcquisitionTaskKind(task.kind)) {
			await tx.agentTask.create({
				data: {
					contactId: task.contactId,
					companyId: task.companyId,
					kind: task.kind,
					reason: task.reason,
					priority: task.priority,
					budget: task.budget,
					dueAt: new Date(
						now.getTime() + ACQUISITION_TASK_INTERVAL_MS[task.kind],
					),
				},
			});
		}

		return {
			id: task.id,
			contactId: task.contactId,
			companyId: task.companyId,
			kind: task.kind,
		};
	});
}

export async function failTask(
	taskId: string,
	reason: string,
): Promise<{ subject: TaskSubject; retrying: boolean } | null> {
	const task = await db.agentTask.findUnique({
		where: { id: taskId },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			kind: true,
			attempts: true,
			finishedAt: true,
		},
	});

	if (!task || task.finishedAt) return null;

	if (task.attempts >= MAX_ATTEMPTS) {
		const now = new Date();
		const failure = reason.slice(0, 500);
		const { count } = await db.agentTask.updateMany({
			where: { id: taskId, finishedAt: null },
			data: {
				finishedAt: now,
				leasedUntil: null,
				outcome: failure,
				lastError: failure,
			},
		});

		if (count === 1 && task.kind === "acquisition-refresh") {
			await failAcquisitionResearchRun(taskId, failure);
		}

		return count === 1
			? {
					subject: {
						id: task.id,
						contactId: task.contactId,
						companyId: task.companyId,
						kind: task.kind,
					},
					retrying: false,
				}
			: null;
	}

	const now = new Date();
	const retryAt = new Date(now.getTime() + RETRY_DELAY_MS);
	const failure = reason.slice(0, 500);
	const { count } = await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null, outcome: null },
		data: {
			dueAt: retryAt,
			leasedUntil: null,
			lastError: failure,
			outcome: `${RETRYING_OUTCOME_PREFIX} ${reason}`.slice(0, 500),
		},
	});

	return count === 1
		? {
				subject: {
					id: task.id,
					contactId: task.contactId,
					companyId: task.companyId,
					kind: task.kind,
				},
				retrying: true,
			}
		: null;
}

export async function taskSubject(taskId: string): Promise<TaskSubject | null> {
	return db.agentTask.findUnique({
		where: { id: taskId },
		select: { id: true, contactId: true, companyId: true, kind: true },
	});
}

export async function noteSession(
	taskId: string,
	sessionId: string,
): Promise<void> {
	await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null },
		data: { sessionId },
	});
}

export async function scheduleTask(
	input: QueueAgentTaskInput,
): Promise<{ id: string }> {
	const { taskId } = await queueAgentTask(db, input);
	return { id: taskId };
}

export async function lastDecision(contactId: string) {
	return db.agentTask.findFirst({
		where: { contactId },
		orderBy: { createdAt: "desc" },
		select: {
			kind: true,
			reason: true,
			dueAt: true,
			finishedAt: true,
			outcome: true,
		},
	});
}

export type { Prisma };

function isAcquisitionTaskKind(
	kind: string,
): kind is keyof typeof ACQUISITION_TASK_INTERVAL_MS {
	return (ACQUISITION_TASK_KINDS as readonly string[]).includes(kind);
}
