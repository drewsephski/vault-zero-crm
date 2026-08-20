import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { AcquisitionStage, db } from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";
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
});
