import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { AcquisitionStage, db } from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";
import { completeTask } from "../agent/lib/tasks";
import updateAcquisitionProfile from "../agent/tools/update_acquisition_profile";

const suffix = crypto.randomUUID();
const organizationId = `agent-buy-box-org-${suffix}`;
const foreignOrganizationId = `agent-foreign-buy-box-org-${suffix}`;
const userId = `agent-buy-box-user-${suffix}`;
const foreignUserId = `agent-foreign-buy-box-user-${suffix}`;
const companyIds: string[] = [];

beforeAll(async () => {
	await db.user.createMany({
		data: [
			{
				id: userId,
				name: "Agent Buy Box Owner",
				email: `agent-buy-box-${suffix}@example.test`,
			},
			{
				id: foreignUserId,
				name: "Agent Foreign Buy Box Owner",
				email: `agent-foreign-buy-box-${suffix}@example.test`,
			},
		],
	});
	await db.organization.createMany({
		data: [
			{
				id: organizationId,
				name: "Agent Buy Box",
				slug: `agent-buy-box-${suffix}`,
				createdAt: new Date(),
			},
			{
				id: foreignOrganizationId,
				name: "Agent Foreign Buy Box",
				slug: `agent-foreign-buy-box-${suffix}`,
				createdAt: new Date(),
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: crypto.randomUUID(),
				organizationId,
				userId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: crypto.randomUUID(),
				organizationId: foreignOrganizationId,
				userId: foreignUserId,
				role: "owner",
				createdAt: new Date(),
			},
		],
	});
	for (const currentOrganizationId of [organizationId, foreignOrganizationId]) {
		await runInOrganization(currentOrganizationId, async () => {
			await db.acquisitionProfile.create({
				data: {
					id: currentOrganizationId,
					preferredIndustries: ["Industrial services"],
					geographies: [],
					excludedCategories: [],
					currency: "USD",
				},
			});
			const company = await db.company.create({
				data: {
					name: `Agent Refresh ${currentOrganizationId}`,
					domain: `${currentOrganizationId}.test`,
					acquisitionTarget: {
						create: {
							stage: AcquisitionStage.DISCOVERED,
							researchedAt: new Date(
								currentOrganizationId === organizationId
									? "1900-01-01T00:00:00.000Z"
									: "1900-01-02T00:00:00.000Z",
							),
							strengths: [],
							concerns: [],
							missingInformation: [],
							sourceUrls: [],
						},
					},
				},
				select: { id: true },
			});
			companyIds.push(company.id);
		});
	}
});

afterAll(async () => {
	await db.$executeRaw`
		DELETE FROM "agentTask"
		WHERE "companyId" IN (${companyIds[0]}, ${companyIds[1]})
	`;
	for (const currentOrganizationId of [organizationId, foreignOrganizationId]) {
		await runInOrganization(currentOrganizationId, async () => {
			await db.company.deleteMany({ where: { id: { in: companyIds } } });
			await db.acquisitionProfile.deleteMany({
				where: { id: currentOrganizationId },
			});
		});
	}
	await db.member.deleteMany({
		where: { userId: { in: [userId, foreignUserId] } },
	});
	await db.organization.deleteMany({
		where: { id: { in: [organizationId, foreignOrganizationId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [userId, foreignUserId] } } });
});

describe("agent buy-box target refresh tenancy", () => {
	it("queues refresh tasks only for targets in the updated workspace", async () => {
		delete process.env.AGENT_BRIDGE_SECRET;
		const result = await updateAcquisitionProfile.execute(
			{
				operation: "update",
				customerConcentrationMax: 20,
			},
			{
				session: {
					id: crypto.randomUUID(),
					auth: {
						current: {
							principalId: userId,
							attributes: { organizationId },
						},
					},
				},
			} as never,
		);

		expect(result.updated).toBe(true);
		const tasks = await db.$queryRaw<
			Array<{ organizationId: string; companyId: string | null }>
		>`
			SELECT "organizationId", "companyId"
			FROM "agentTask"
			WHERE kind = 'acquisition-refresh'
			AND "companyId" IN (${companyIds[0]}, ${companyIds[1]})
		`;
		expect(tasks).toContainEqual({
			organizationId,
			companyId: companyIds[0],
		});
		expect(tasks).not.toContainEqual({
			organizationId,
			companyId: companyIds[1],
		});
	});

	it("increments once for concurrent identical semantic changes", async () => {
		await db.$executeRaw`
			DELETE FROM "agentTask" WHERE "organizationId" = ${organizationId}
		`;
		const [before] = await db.$queryRaw<
			Array<{
				buyBoxRevision: number;
				customerConcentrationMax: number | null;
			}>
		>`
			SELECT "buyBoxRevision", "customerConcentrationMax"
			FROM "acquisitionProfile"
			WHERE id = ${organizationId}
		`;
		if (!before) throw new Error("expected acquisition profile");
		const customerConcentrationMax =
			before.customerConcentrationMax === 25 ? 26 : 25;
		const context = {
			session: {
				id: crypto.randomUUID(),
				auth: {
					current: {
						principalId: userId,
						attributes: { organizationId },
					},
				},
			},
		} as never;

		const results = await Promise.all(
			Array.from({ length: 12 }, () =>
				updateAcquisitionProfile.execute(
					{ operation: "update", customerConcentrationMax },
					context,
				),
			),
		);
		expect(results.every((result) => result.updated)).toBe(true);
		expect(
			await db.$queryRaw<Array<{ buyBoxRevision: number }>>`
				SELECT "buyBoxRevision"
				FROM "acquisitionProfile"
				WHERE id = ${organizationId}
			`,
		).toEqual([{ buyBoxRevision: before.buyBoxRevision + 1 }]);
		expect(
			await db.$queryRaw<Array<{ count: bigint }>>`
				SELECT COUNT(*) AS count
				FROM "agentTask"
				WHERE "organizationId" = ${organizationId}
				AND kind = 'acquisition-discovery'
				AND "finishedAt" IS NULL
			`,
		).toEqual([{ count: 1n }]);
		expect(
			await db.$queryRaw<Array<{ count: bigint }>>`
				SELECT COUNT(*) AS count
				FROM "agentTask"
				WHERE "organizationId" = ${organizationId}
				AND kind = 'acquisition-refresh'
				AND "finishedAt" IS NULL
			`,
		).toEqual([{ count: 1n }]);
	});

	it("drains active stale targets in bounded priority order", async () => {
		const neverIds = Array.from(
			{ length: 55 },
			(_, index) => `refresh-never-${suffix}-${index}`,
		);
		const oldIds = Array.from(
			{ length: 5 },
			(_, index) => `refresh-old-${suffix}-${index}`,
		);
		const terminalIds = Array.from(
			{ length: 55 },
			(_, index) => `refresh-terminal-${suffix}-${index}`,
		);
		const allIds = [...neverIds, ...oldIds, ...terminalIds];
		const context = {
			session: {
				id: crypto.randomUUID(),
				auth: {
					current: {
						principalId: userId,
						attributes: { organizationId },
					},
				},
			},
		} as never;

		await runInOrganization(organizationId, async () => {
			await db.agentTask.deleteMany({});
			await db.acquisitionTarget.update({
				where: { companyId: companyIds[0] },
				data: { stage: AcquisitionStage.ACQUIRED },
			});
			await db.company.createMany({
				data: allIds.map((id) => ({
					id,
					organizationId,
					name: id,
					domain: `${id}.test`,
				})),
			});
			await db.acquisitionTarget.createMany({
				data: [
					...neverIds.map((companyId) => ({
						companyId,
						stage: AcquisitionStage.DISCOVERED,
						strengths: [],
						concerns: [],
						missingInformation: [],
						sourceUrls: [],
					})),
					...oldIds.map((companyId) => ({
						companyId,
						stage: AcquisitionStage.WATCHLIST,
						researchedAt: new Date("2026-01-01T00:00:00.000Z"),
						researchedBuyBoxRevision: 0,
						strengths: [],
						concerns: [],
						missingInformation: [],
						sourceUrls: [],
					})),
					...terminalIds.map((companyId, index) => ({
						companyId,
						stage:
							index % 2 === 0
								? AcquisitionStage.REJECTED
								: AcquisitionStage.ACQUIRED,
						strengths: [],
						concerns: [],
						missingInformation: [],
						sourceUrls: [],
					})),
				],
			});
		});

		try {
			const profile = await runInOrganization(organizationId, () =>
				db.acquisitionProfile.findUniqueOrThrow({
					where: { id: organizationId },
					select: { customerConcentrationMax: true },
				}),
			);
			const update = await updateAcquisitionProfile.execute(
				{
					operation: "update",
					customerConcentrationMax:
						profile.customerConcentrationMax === 30 ? 31 : 30,
				},
				context,
			);
			expect(update.updated).toBe(true);

			const firstBatch = await db.$queryRaw<
				Array<{ id: string; companyId: string | null }>
			>`
				SELECT id, "companyId"
				FROM "agentTask"
				WHERE "organizationId" = ${organizationId}
				AND kind = 'acquisition-refresh'
				AND "finishedAt" IS NULL
				ORDER BY "createdAt" ASC
			`;
			expect(firstBatch).toHaveLength(50);
			expect(
				firstBatch.every(
					(task) => task.companyId && neverIds.includes(task.companyId),
				),
			).toBe(true);
			const rapidUpdate = await updateAcquisitionProfile.execute(
				{
					operation: "update",
					customerConcentrationMax:
						profile.customerConcentrationMax === 32 ? 33 : 32,
				},
				context,
			);
			expect(rapidUpdate.updated).toBe(true);
			expect(
				await db.$queryRaw<Array<{ count: bigint }>>`
					SELECT COUNT(*) AS count
					FROM "agentTask"
					WHERE "organizationId" = ${organizationId}
					AND kind = 'acquisition-refresh'
					AND "finishedAt" IS NULL
				`,
			).toEqual([{ count: 50n }]);

			const firstTask = firstBatch[0];
			if (!firstTask) throw new Error("expected initial refresh task");
			await runInOrganization(organizationId, () =>
				completeTask(firstTask.id, "ran"),
			);
			expect(
				await db.$queryRaw<Array<{ count: bigint }>>`
					SELECT COUNT(*) AS count
					FROM "agentTask"
					WHERE "organizationId" = ${organizationId}
					AND kind = 'acquisition-refresh'
					AND "finishedAt" IS NULL
				`,
			).toEqual([{ count: 51n }]);
			for (const task of firstBatch.slice(1, 10)) {
				await runInOrganization(organizationId, () =>
					completeTask(task.id, "ran"),
				);
			}

			const queuedCompanyIds = new Set(
				(
					await db.$queryRaw<Array<{ companyId: string | null }>>`
						SELECT "companyId"
						FROM "agentTask"
						WHERE "organizationId" = ${organizationId}
						AND kind = 'acquisition-refresh'
						AND "finishedAt" IS NULL
					`
				).flatMap((task) => (task.companyId ? [task.companyId] : [])),
			);
			expect(queuedCompanyIds).toEqual(new Set([...neverIds, ...oldIds]));
			expect(
				terminalIds.some((companyId) => queuedCompanyIds.has(companyId)),
			).toBe(false);

			const [beforeClear] = await db.$queryRaw<Array<{ count: bigint }>>`
				SELECT COUNT(*) AS count
				FROM "agentTask"
				WHERE "organizationId" = ${organizationId}
				AND kind = 'acquisition-refresh'
			`;
			const cleared = await updateAcquisitionProfile.execute(
				{ operation: "replace", currency: "USD" },
				context,
			);
			expect(cleared.updated).toBe(true);
			expect(
				await db.$queryRaw<Array<{ count: bigint }>>`
					SELECT COUNT(*) AS count
					FROM "agentTask"
					WHERE "organizationId" = ${organizationId}
					AND kind = 'acquisition-refresh'
				`,
			).toEqual([beforeClear]);
		} finally {
			await runInOrganization(organizationId, async () => {
				await db.agentTask.deleteMany({});
				await db.company.deleteMany({ where: { id: { in: allIds } } });
				await db.acquisitionTarget.update({
					where: { companyId: companyIds[0] },
					data: { stage: AcquisitionStage.DISCOVERED },
				});
			});
		}
	});
});
