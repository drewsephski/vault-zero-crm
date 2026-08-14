import { describe, expect, it } from "bun:test";
import { type db, Prisma } from "@crm/db";
import { queueAcquisitionDiscovery } from "../agent/tools/update_acquisition_profile";

describe("update acquisition profile", () => {
	it("recovers the active discovery task when concurrent updates race", async () => {
		let task:
			| {
					id: string;
					dueAt: Date;
					startedAt: null;
			  }
			| undefined;
		let preflights = 0;
		let releasePreflights: () => void = () => {};
		const preflightBarrier = new Promise<void>((resolve) => {
			releasePreflights = resolve;
		});
		const database = {
			agentTask: {
				findFirst: async () => {
					if (preflights < 2) {
						preflights += 1;
						if (preflights === 2) releasePreflights();
						await preflightBarrier;
						return null;
					}
					return task ?? null;
				},
				create: async (input: { data: { dueAt: Date } }) => {
					if (task) {
						throw new Prisma.PrismaClientKnownRequestError("Unique task", {
							code: "P2002",
							clientVersion: "test",
						});
					}
					task = {
						id: "discovery-task",
						dueAt: input.data.dueAt,
						startedAt: null,
					};
					return { id: task.id };
				},
				updateMany: async (input: { data: { dueAt: Date } }) => {
					if (!task) return { count: 0 };
					task.dueAt = input.data.dueAt;
					return { count: 1 };
				},
			},
		} as unknown as typeof db;

		const results = await Promise.all([
			queueAcquisitionDiscovery(database),
			queueAcquisitionDiscovery(database),
		]);

		expect(results.map((result) => result.taskId)).toEqual([
			"discovery-task",
			"discovery-task",
		]);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(task?.id).toBe("discovery-task");
	});
});
