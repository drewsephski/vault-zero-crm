import { describe, expect, it } from "bun:test";
import { agentTaskState } from "../src/agent-tasks";

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
