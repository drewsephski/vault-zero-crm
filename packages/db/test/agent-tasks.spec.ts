import { describe, expect, it } from "bun:test";
import { db } from "../src";
import { agentTaskState, queueAgentTask } from "../src/agent-tasks";

describe("agentTaskState", () => {
	it("maps persisted task rows to acquisition research state", () => {
		const now = new Date("2026-08-13T18:00:00.000Z");

		expect(agentTaskState(null, now)).toEqual({
			status: "idle",
			error: null,
		});
		expect(
			agentTaskState(
				{
					dueAt: now,
					startedAt: null,
					finishedAt: null,
					outcome: null,
					lastError: null,
				},
				now,
			),
		).toEqual({ status: "queued", error: null });
		expect(
			agentTaskState(
				{
					dueAt: new Date("2026-09-12T18:00:00.000Z"),
					startedAt: null,
					finishedAt: null,
					outcome: null,
					lastError: null,
				},
				now,
			),
		).toEqual({ status: "idle", error: null });
		expect(
			agentTaskState(
				{
					dueAt: now,
					startedAt: now,
					finishedAt: null,
					outcome: null,
					lastError: null,
				},
				now,
			),
		).toEqual({ status: "running", error: null });
		expect(
			agentTaskState(
				{
					dueAt: now,
					startedAt: now,
					finishedAt: null,
					outcome: "retrying: provider timeout",
					lastError: "provider timeout",
				},
				now,
			),
		).toEqual({ status: "retrying", error: "provider timeout" });
		expect(
			agentTaskState(
				{
					dueAt: now,
					startedAt: now,
					finishedAt: now,
					outcome: "provider timeout",
					lastError: "provider timeout",
				},
				now,
			),
		).toEqual({ status: "failed", error: "provider timeout" });
	});
});

describe("queueAgentTask", () => {
	it("advances the recurrence when completion wins the enqueue race", async () => {
		const dueNow = new Date("2026-08-13T18:00:00.000Z");
		const originalDueAt = new Date("2026-09-12T18:00:00.000Z");
		const tasks = {
			finishing: {
				id: "finishing-task",
				dueAt: originalDueAt,
				startedAt: null,
			},
			recurrence: {
				id: "recurrence-task",
				dueAt: originalDueAt,
				startedAt: null,
				reason: "Scheduled recurrence",
				priority: 30,
				budget: 4,
			},
		};
		let active: "finishing" | "recurrence" = "finishing";
		const database = {
			agentTask: {
				findFirst: async () => tasks[active],
				create: async () => {
					throw new Error("The recurrence should win without another create.");
				},
				updateMany: async (input: {
					where: { id: string };
					data: {
						dueAt: Date;
						reason: string;
						priority: number;
						budget: number;
					};
				}) => {
					if (input.where.id === tasks.finishing.id) {
						active = "recurrence";
						return { count: 0 };
					}
					tasks.recurrence.dueAt = input.data.dueAt;
					tasks.recurrence.reason = input.data.reason;
					tasks.recurrence.priority = input.data.priority;
					tasks.recurrence.budget = input.data.budget;
					return { count: 1 };
				},
			},
		} as unknown as typeof db;

		const result = await queueAgentTask(database, {
			companyId: "company-1",
			kind: "acquisition-refresh",
			reason: "Manual acquisition refresh",
			dueAt: dueNow,
			priority: 300,
			budget: 12,
		});

		expect(result).toEqual({
			taskId: "recurrence-task",
			created: false,
			advanced: true,
		});
		expect(tasks.recurrence).toMatchObject({
			dueAt: dueNow,
			reason: "Manual acquisition refresh",
			priority: 300,
			budget: 12,
		});
	});

	it("converges concurrent scheduling on one persisted task", async () => {
		const companyId = `db-agent-task-${crypto.randomUUID()}`;

		try {
			const results = await Promise.all(
				Array.from({ length: 10 }, () =>
					queueAgentTask(db, {
						companyId,
						kind: "acquisition-refresh",
						reason: "Refresh acquisition fit",
						dueAt: new Date(Date.now() + 60_000),
						priority: 30,
						budget: 8,
					}),
				),
			);

			expect(new Set(results.map((result) => result.taskId)).size).toBe(1);
			expect(results.filter((result) => result.created)).toHaveLength(1);
			expect(
				await db.agentTask.count({
					where: {
						companyId,
						kind: "acquisition-refresh",
						finishedAt: null,
					},
				}),
			).toBe(1);
		} finally {
			await db.agentTask.deleteMany({ where: { companyId } });
		}
	});
});
