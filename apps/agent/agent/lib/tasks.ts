import { db, Prisma } from "@crm/db";
import { MAX_ATTEMPTS, RETIRED_OUTCOME } from "@crm/db/agent-tasks";

export type LeasedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
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
		RETURNING t.id, t."contactId", t."companyId", t.kind, t.reason,
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
		RETURNING t.id, t."contactId", t."companyId", t.kind, t.reason,
			t.budget, t.attempts, t.priority, t."dueAt";
	`;

	return claimed.sort(
		(a, b) => b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime(),
	);
}

export async function retireExhausted(): Promise<TaskSubject[]> {
	const now = new Date();

	return db.$queryRaw<TaskSubject[]>`
		UPDATE "agentTask" AS t
		SET "finishedAt" = ${now},
			"outcome" = ${RETIRED_OUTCOME}
		WHERE t."finishedAt" IS NULL
			AND t."attempts" >= ${MAX_ATTEMPTS}
			AND (t."leasedUntil" IS NULL OR t."leasedUntil" < ${now})
		RETURNING t.id, t."contactId", t."companyId", t.kind;
	`;
}

export async function completeTask(
	taskId: string,
	outcome: string,
	sessionId?: string,
): Promise<TaskSubject | null> {
	const { count } = await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null, outcome: null },
		data: {
			finishedAt: new Date(),
			outcome: outcome.slice(0, 500),
			...(sessionId ? { sessionId } : {}),
		},
	});

	if (count === 0) return null;

	return db.agentTask.findUnique({
		where: { id: taskId },
		select: { id: true, contactId: true, companyId: true, kind: true },
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
		const subject = await completeTask(taskId, reason);
		return subject ? { subject, retrying: false } : null;
	}

	const { count } = await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null, outcome: null },
		data: {
			dueAt: new Date(Date.now() + RETRY_DELAY_MS),
			leasedUntil: null,
			outcome: `retrying: ${reason}`.slice(0, 500),
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

export async function scheduleTask(input: {
	contactId?: string | null;
	companyId?: string | null;
	kind: string;
	reason: string;
	dueAt: Date;
	priority?: number;
}): Promise<{ id: string }> {
	const existing = await db.agentTask.findFirst({
		where: {
			kind: input.kind,
			finishedAt: null,
			contactId: input.contactId ?? undefined,
			companyId: input.companyId ?? undefined,
		},
		select: { id: true },
	});

	if (existing) {
		await db.agentTask.update({
			where: { id: existing.id },
			data: { dueAt: input.dueAt, reason: input.reason },
		});
		return existing;
	}

	return db.agentTask.create({
		data: {
			contactId: input.contactId ?? null,
			companyId: input.companyId ?? null,
			kind: input.kind,
			reason: input.reason,
			dueAt: input.dueAt,
			priority: input.priority ?? 0,
		},
		select: { id: true },
	});
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
