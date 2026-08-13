import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ACQUISITION_TASK_INTERVAL_MS } from "@crm/db/acquisition";
import { DIRECT_KINDS, RETRYING_OUTCOME_PREFIX } from "@crm/db/agent-tasks";
import {
	claimDue,
	completeTask,
	failTask,
	MAX_ATTEMPTS,
	retireExhausted,
	scheduleTask,
} from "../agent/lib/tasks";

const kind = "test-lease";
const acquisitionKind = "acquisition-refresh";
const acquisitionCompanyId = `task-test-${crypto.randomUUID()}`;

const RESEARCH = { except: DIRECT_KINDS } as const;

async function clear() {
	await db.agentTask.deleteMany({
		where: {
			OR: [{ kind }, { companyId: acquisitionCompanyId }],
		},
	});
	await db.contact.deleteMany({ where: { email: { startsWith: "lease-" } } });
}

beforeEach(clear);
afterEach(clear);

async function queue(
	overrides: { priority?: number; dueAt?: Date; contactId?: string } = {},
) {
	return db.agentTask.create({
		data: {
			kind,
			reason: "test",
			dueAt: overrides.dueAt ?? new Date(Date.now() - 1000),
			priority: overrides.priority ?? 0,
			budget: 4,
			contactId: overrides.contactId ?? `lease-task-${crypto.randomUUID()}`,
		},
		select: { id: true },
	});
}

async function expire(taskId: string) {
	await db.agentTask.update({
		where: { id: taskId },
		data: { leasedUntil: new Date(Date.now() - 1000) },
	});
}

async function someone() {
	return db.contact.create({
		data: {
			firstName: "Lease",
			email: `lease-${crypto.randomUUID()}@example.test`,
		},
		select: { id: true },
	});
}

describe("claimDue", () => {
	it("claims due work and leases it", async () => {
		const task = await queue();

		const claimed = await claimDue(10, RESEARCH);
		expect(claimed.map((t) => t.id)).toContain(task.id);

		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.leasedUntil).not.toBeNull();
		expect(row?.startedAt).not.toBeNull();
	});

	it("does not hand the same row to two dispatchers", async () => {
		await Promise.all([queue(), queue(), queue()]);

		const [first, second] = await Promise.all([
			claimDue(3, RESEARCH),
			claimDue(3, RESEARCH),
		]);
		const ids = [...first, ...second].map((t) => t.id);

		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toHaveLength(3);
	});

	it("leaves work that is not due yet", async () => {
		await queue({ dueAt: new Date(Date.now() + 60_000) });
		const claimed = await claimDue(10, RESEARCH);
		expect(claimed).toHaveLength(0);
	});

	it("takes the most urgent first", async () => {
		const low = await queue({ priority: 0 });
		const high = await queue({ priority: 100 });

		const claimed = await claimDue(1, RESEARCH);
		expect(claimed[0]?.id).toBe(high.id);
		expect(claimed[0]?.id).not.toBe(low.id);
	});

	it("does not re-claim a leased row, and does re-claim an expired one", async () => {
		const task = await queue();
		await claimDue(10, RESEARCH);

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);

		await db.agentTask.update({
			where: { id: task.id },
			data: { leasedUntil: new Date(Date.now() - 1000) },
		});

		expect((await claimDue(10, RESEARCH)).map((t) => t.id)).toContain(task.id);
	});

	it("stops handing out a row that has spent its attempts", async () => {
		const task = await queue();

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			expect((await claimDue(10, RESEARCH)).map((t) => t.id)).toContain(
				task.id,
			);
			await expire(task.id);
		}

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);
	});

	it("counts the attempts it has handed out", async () => {
		const task = await queue();

		expect((await claimDue(10, RESEARCH))[0]?.attempts).toBe(1);
		await expire(task.id);
		expect((await claimDue(10, RESEARCH))[0]?.attempts).toBe(2);
	});

	it("stops claiming once the work is finished", async () => {
		const task = await queue();
		await claimDue(10, RESEARCH);
		await completeTask(task.id, "ran");

		await db.agentTask.update({
			where: { id: task.id },
			data: { leasedUntil: null },
		});

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);
	});
});

describe("retireExhausted", () => {
	it("gives up on a row that never reported back, and says who it was about", async () => {
		const contact = await someone();
		const task = await queue({ contactId: contact.id });

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			await claimDue(10, RESEARCH);
			await expire(task.id);
		}

		const retired = await retireExhausted();
		expect(retired.map((t) => t.id)).toContain(task.id);
		expect(retired.find((t) => t.id === task.id)?.contactId).toBe(contact.id);

		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.finishedAt).not.toBeNull();
		expect(row?.outcome).toContain("Gave up");
		expect(row?.lastError).toBe(row?.outcome);
	});

	it("leaves a row that is still leased on its last attempt alone", async () => {
		const task = await queue();

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			await claimDue(10, RESEARCH);
			if (attempt < MAX_ATTEMPTS - 1) await expire(task.id);
		}

		expect(await retireExhausted()).toHaveLength(0);
	});

	it("leaves work that still has attempts left", async () => {
		await queue();
		await claimDue(10, RESEARCH);

		expect(await retireExhausted()).toHaveLength(0);
	});
});

describe("completeTask", () => {
	it("retires a row once, and reports who it was about", async () => {
		const contact = await someone();
		const task = await queue({ contactId: contact.id });
		await claimDue(10, RESEARCH);

		const subject = await completeTask(task.id, "ran");
		expect(subject?.contactId).toBe(contact.id);

		expect(await completeTask(task.id, "ran again")).toBeNull();
		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.outcome).toBe("ran");
	});

	it("clears failure state and schedules the next acquisition refresh", async () => {
		const dueAt = new Date(Date.now() - 1000);
		const task = await db.agentTask.create({
			data: {
				companyId: acquisitionCompanyId,
				kind: acquisitionKind,
				reason: "Analyze acquisition fit",
				dueAt,
				lastError: "Historical provider timeout",
			},
			select: { id: true },
		});
		await claimDue(10, RESEARCH);

		const completedAfter = new Date();
		await completeTask(task.id, "Dossier refreshed");

		const rows = await db.agentTask.findMany({
			where: { companyId: acquisitionCompanyId, kind: acquisitionKind },
			orderBy: { createdAt: "asc" },
		});
		expect(rows).toHaveLength(2);
		expect(rows[0]?.finishedAt).not.toBeNull();
		expect(rows[0]?.lastError).toBeNull();
		expect(rows[1]?.finishedAt).toBeNull();
		expect(rows[1]?.startedAt).toBeNull();
		expect(rows[1]?.dueAt.getTime()).toBeGreaterThanOrEqual(
			completedAfter.getTime() + ACQUISITION_TASK_INTERVAL_MS[acquisitionKind],
		);
	});
});

describe("failTask", () => {
	it("requeues a failed session while attempts remain", async () => {
		const contact = await someone();
		const task = await queue({ contactId: contact.id });
		await claimDue(10, RESEARCH);

		const result = await failTask(task.id, "The provider was rate limited.");
		expect(result?.retrying).toBe(true);

		const waiting = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(waiting?.finishedAt).toBeNull();
		expect(waiting?.leasedUntil).toBeNull();
		expect(waiting?.outcome).toBe(
			`${RETRYING_OUTCOME_PREFIX} The provider was rate limited.`,
		);
		expect(waiting?.lastError).toBe("The provider was rate limited.");

		await db.agentTask.update({
			where: { id: task.id },
			data: { dueAt: new Date(Date.now() - 1000) },
		});
		expect((await claimDue(10, RESEARCH)).map((row) => row.id)).toContain(
			task.id,
		);
		const running = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(running?.outcome).toBeNull();
		expect(running?.lastError).toBe("The provider was rate limited.");
	});

	it("finishes a terminal acquisition failure without a recurrence", async () => {
		const task = await db.agentTask.create({
			data: {
				companyId: acquisitionCompanyId,
				kind: acquisitionKind,
				reason: "Analyze acquisition fit",
				dueAt: new Date(Date.now() - 1000),
				attempts: MAX_ATTEMPTS,
			},
			select: { id: true },
		});

		const result = await failTask(task.id, "Provider access was revoked.");

		expect(result?.retrying).toBe(false);
		const rows = await db.agentTask.findMany({
			where: { companyId: acquisitionCompanyId, kind: acquisitionKind },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.finishedAt).not.toBeNull();
		expect(rows[0]?.outcome).toBe("Provider access was revoked.");
		expect(rows[0]?.lastError).toBe("Provider access was revoked.");
	});
});

describe("scheduleTask", () => {
	it("books work with the agent's own reason", async () => {
		const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
		const { id } = await scheduleTask({
			kind,
			reason: "a job change here would move the Acme deal",
			dueAt,
		});

		const row = await db.agentTask.findUnique({ where: { id } });
		expect(row?.reason).toContain("Acme");
	});

	it("keeps the earlier existing booking rather than queueing a second one", async () => {
		const soon = new Date(Date.now() + 1000);
		const later = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

		const first = await scheduleTask({ kind, reason: "first", dueAt: soon });
		const second = await scheduleTask({ kind, reason: "second", dueAt: later });

		expect(second.id).toBe(first.id);
		expect(await db.agentTask.count({ where: { kind } })).toBe(1);
		const row = await db.agentTask.findUnique({ where: { id: first.id } });
		expect(row?.dueAt).toEqual(soon);
		expect(row?.reason).toBe("first");
	});

	it("leaves a running task untouched", async () => {
		const dueAt = new Date(Date.now() - 1000);
		const first = await scheduleTask({
			kind,
			reason: "current",
			dueAt,
		});
		await claimDue(10, RESEARCH);

		const existing = await scheduleTask({
			kind,
			reason: "refresh later",
			dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		});

		expect(existing.id).toBe(first.id);
		expect(await db.agentTask.count({ where: { kind } })).toBe(1);
		const row = await db.agentTask.findUnique({ where: { id: first.id } });
		expect(row?.dueAt).toEqual(dueAt);
		expect(row?.reason).toBe("current");
	});

	it("converges concurrent acquisition scheduling on one task", async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, () =>
				scheduleTask({
					companyId: acquisitionCompanyId,
					kind: acquisitionKind,
					reason: "Refresh acquisition fit",
					dueAt: new Date(Date.now() + 60_000),
					priority: 30,
					budget: 8,
				}),
			),
		);

		expect(new Set(results.map((result) => result.id)).size).toBe(1);
		expect(
			await db.agentTask.count({
				where: {
					companyId: acquisitionCompanyId,
					kind: acquisitionKind,
					finishedAt: null,
				},
			}),
		).toBe(1);
	});

	it("brings a future unstarted acquisition refresh due now", async () => {
		const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		const first = await scheduleTask({
			companyId: acquisitionCompanyId,
			kind: acquisitionKind,
			reason: "Scheduled recurrence",
			dueAt: future,
			priority: 30,
			budget: 4,
		});
		const now = new Date();

		const requested = await scheduleTask({
			companyId: acquisitionCompanyId,
			kind: acquisitionKind,
			reason: "Manual acquisition refresh",
			dueAt: now,
			priority: 300,
			budget: 12,
		});

		expect(requested.id).toBe(first.id);
		expect(
			await db.agentTask.count({ where: { companyId: acquisitionCompanyId } }),
		).toBe(1);
		const row = await db.agentTask.findUnique({ where: { id: first.id } });
		expect(row?.dueAt).toEqual(now);
		expect(row?.reason).toBe("Manual acquisition refresh");
		expect(row?.priority).toBe(300);
		expect(row?.budget).toBe(12);
	});
});
