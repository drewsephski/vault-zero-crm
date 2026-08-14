import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { db, Prisma } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import {
	AgentTriggerService,
	keepAgentDispatchAlive,
	requestAgentDispatch,
} from "../src/agent/agent-trigger.service";

const agent = {
	url: (path: string) => new URL(path, "https://agent.example.com"),
	secret: "test-bridge-secret",
};

describe("requestAgentDispatch", () => {
	it("waits for the agent to accept the dispatch", async () => {
		const requests: Array<{
			input: Parameters<typeof fetch>[0];
			init: Parameters<typeof fetch>[1];
		}> = [];
		const fetcher = mock(
			async (
				input: Parameters<typeof fetch>[0],
				init: Parameters<typeof fetch>[1],
			) => {
				requests.push({ input, init });
				return new Response(null, { status: 202 });
			},
		);

		await requestAgentDispatch(agent, fetcher as unknown as typeof fetch);

		expect(String(requests[0]?.input)).toBe(
			"https://agent.example.com/internal/crm/dispatch",
		);
		expect(requests[0]?.init?.method).toBe("POST");
		expect(requests[0]?.init?.headers).toEqual({
			authorization: "Bearer test-bridge-secret",
		});
		expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
	});

	it("rejects a dispatch the agent did not accept", async () => {
		const fetcher = mock(async () => new Response(null, { status: 401 }));

		expect(
			requestAgentDispatch(agent, fetcher as unknown as typeof fetch),
		).rejects.toThrow("Agent dispatch returned HTTP 401.");
	});
});

describe("keepAgentDispatchAlive", () => {
	it("registers the dispatch with the Vercel request lifecycle", () => {
		const dispatch = Promise.resolve();
		const defer = mock((_promise: Promise<unknown>) => {});

		keepAgentDispatchAlive(dispatch, { isVercel: true, defer });

		expect(defer).toHaveBeenCalledWith(dispatch);
	});

	it("does not require a lifecycle outside Vercel", () => {
		const defer = mock((_promise: Promise<unknown>) => {});

		keepAgentDispatchAlive(Promise.resolve(), {
			isVercel: false,
			defer,
		});

		expect(defer).not.toHaveBeenCalled();
	});
});

describe("AgentTriggerService", () => {
	const companyId = `agent-trigger-${crypto.randomUUID()}`;
	const service = new AgentTriggerService(db);
	const queue = new AgentQueueService(db);

	async function clear() {
		await db.agentTask.deleteMany({ where: { companyId } });
	}

	beforeEach(clear);
	afterEach(clear);

	it("converges concurrent acquisition requests on one task", async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, () =>
				service.acquisitionTargetRequested(
					companyId,
					"Analyze acquisition fit",
				),
			),
		);

		expect(results.every((result) => Boolean(result?.taskId))).toBe(true);
		expect(new Set(results.map((result) => result.taskId)).size).toBe(1);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(
			await db.agentTask.count({
				where: { companyId, kind: "acquisition-refresh", finishedAt: null },
			}),
		).toBe(1);
	});

	it("converges concurrent backfill producers without dropping subjects", async () => {
		const contactIds = Array.from(
			{ length: 20 },
			(_, index) => `backfill-${crypto.randomUUID()}-${index}`,
		);

		try {
			const settled = await Promise.allSettled(
				Array.from({ length: 10 }, () =>
					service.backfill({
						kind: "identify",
						reason: "Concurrent identity backfill",
						contactIds,
					}),
				),
			);

			expect(settled.filter((result) => result.status === "rejected")).toEqual(
				[],
			);
			const results = settled.flatMap((result) =>
				result.status === "fulfilled" ? [result.value] : [],
			);
			expect(results.reduce((total, result) => total + result.queued, 0)).toBe(
				contactIds.length,
			);
			expect(
				await db.agentTask.count({
					where: {
						contactId: { in: contactIds },
						kind: "identify",
						finishedAt: null,
					},
				}),
			).toBe(contactIds.length);
		} finally {
			await db.agentTask.deleteMany({
				where: { contactId: { in: contactIds } },
			});
		}
	});

	it("recovers the persisted winners after concurrent backfill preflights", async () => {
		const contactIds = ["contact-1", "contact-2"];
		const tasks = new Map<
			string,
			{
				id: string;
				contactId: string;
				dueAt: Date;
				startedAt: null;
			}
		>();
		let preflights = 0;
		let releasePreflights: (() => void) | undefined;
		const bothPreflighted = new Promise<void>((resolve) => {
			releasePreflights = resolve;
		});
		const uniqueConflict = () =>
			new Prisma.PrismaClientKnownRequestError("Unique task", {
				code: "P2002",
				clientVersion: "test",
			});
		const database = {
			agentTask: {
				findMany: async () => {
					preflights += 1;
					if (preflights === 2) releasePreflights?.();
					await bothPreflighted;
					return [];
				},
				createMany: async (input: {
					data: Array<{ contactId: string; dueAt: Date }>;
				}) => {
					if (tasks.size > 0) throw uniqueConflict();
					for (const task of input.data) {
						tasks.set(task.contactId, {
							id: `task-${task.contactId}`,
							contactId: task.contactId,
							dueAt: task.dueAt,
							startedAt: null,
						});
					}
					return { count: input.data.length };
				},
				findFirst: async (input: { where: { contactId: string | null } }) =>
					input.where.contactId
						? (tasks.get(input.where.contactId) ?? null)
						: null,
				create: async (input: { data: { contactId: string; dueAt: Date } }) => {
					if (tasks.has(input.data.contactId)) throw uniqueConflict();
					const task = {
						id: `task-${input.data.contactId}`,
						contactId: input.data.contactId,
						dueAt: input.data.dueAt,
						startedAt: null,
					};
					tasks.set(input.data.contactId, task);
					return { id: task.id };
				},
				updateMany: async () => ({ count: 0 }),
			},
		} as unknown as typeof db;
		const first = new AgentTriggerService(database);
		const second = new AgentTriggerService(database);

		const settled = await Promise.allSettled(
			[first, second].map((producer) =>
				producer.backfill({
					kind: "identify",
					reason: "Concurrent identity backfill",
					contactIds,
				}),
			),
		);

		expect(settled.filter((result) => result.status === "rejected")).toEqual(
			[],
		);
		expect(tasks.size).toBe(contactIds.length);
	});

	it("brings a future acquisition recurrence due now", async () => {
		const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		const task = await db.agentTask.create({
			data: {
				companyId,
				kind: "acquisition-refresh",
				reason: "Scheduled recurrence",
				dueAt: future,
				priority: 30,
				budget: 4,
			},
			select: { id: true },
		});

		const result = await service.acquisitionTargetRequested(
			companyId,
			"Manual acquisition refresh",
		);

		expect(result).toEqual({ taskId: task.id, created: false });
		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.dueAt.getTime()).toBeLessThan(future.getTime());
		expect(row?.reason).toBe("Manual acquisition refresh");
		expect(row?.priority).toBe(300);
		expect(row?.budget).toBe(12);
	});

	it("leaves a running acquisition task untouched", async () => {
		const dueAt = new Date(Date.now() - 1000);
		const startedAt = new Date();
		const task = await db.agentTask.create({
			data: {
				companyId,
				kind: "acquisition-refresh",
				reason: "Running acquisition refresh",
				dueAt,
				startedAt,
				priority: 30,
				budget: 4,
			},
			select: { id: true },
		});

		const result = await service.acquisitionTargetRequested(
			companyId,
			"Manual acquisition refresh",
		);

		expect(result).toEqual({ taskId: task.id, created: false });
		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.reason).toBe("Running acquisition refresh");
		expect(row?.dueAt).toEqual(dueAt);
		expect(row?.priority).toBe(30);
		expect(row?.budget).toBe(4);
	});

	it("treats a future acquisition recurrence as idle until explicitly requested", async () => {
		const task = await db.agentTask.create({
			data: {
				companyId,
				kind: "acquisition-refresh",
				reason: "Scheduled recurrence",
				dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			},
			select: { id: true },
		});

		expect(await queue.acquisitionResearchState(companyId)).toEqual({
			status: "idle",
			error: null,
		});

		await service.acquisitionTargetRequested(
			companyId,
			"Manual acquisition refresh",
		);

		expect(await queue.acquisitionResearchState(companyId)).toEqual({
			status: "queued",
			error: null,
		});
		expect(
			await db.agentTask.findUnique({ where: { id: task.id } }),
		).toMatchObject({ id: task.id, reason: "Manual acquisition refresh" });
	});

	it("uses the latest persisted acquisition task", async () => {
		const now = Date.now();
		await db.agentTask.createMany({
			data: [
				{
					companyId,
					kind: "acquisition-refresh",
					reason: "Prior failed refresh",
					dueAt: new Date("2026-07-01T12:00:00.000Z"),
					startedAt: new Date("2026-07-01T12:00:00.000Z"),
					finishedAt: new Date("2026-07-01T12:01:00.000Z"),
					lastError: "prior failure",
					createdAt: new Date(now - 60_000),
				},
				{
					companyId,
					kind: "acquisition-refresh",
					reason: "Future recurrence",
					dueAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
					createdAt: new Date(now),
				},
			],
		});

		expect(await queue.acquisitionResearchState(companyId)).toEqual({
			status: "idle",
			error: null,
		});
	});
});
