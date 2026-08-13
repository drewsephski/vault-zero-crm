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
