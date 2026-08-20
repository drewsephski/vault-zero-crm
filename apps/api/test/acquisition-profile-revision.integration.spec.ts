import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { AcquisitionStage, db } from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { WorkspaceService } from "../src/workspace/workspace.service";

const suffix = crypto.randomUUID();
const organizationId = `buy-box-org-${suffix}`;
const userId = `buy-box-user-${suffix}`;
let discoveryRequests = 0;

const input = {
	preferredIndustries: ["Home Services", "HVAC"],
	geographies: ["Texas"],
	excludedCategories: [],
	currency: "USD",
	revenueMinCents: 100_000_000,
	revenueMaxCents: null,
	ebitdaMinCents: null,
	ebitdaMaxCents: null,
	purchasePriceMinCents: null,
	purchasePriceMaxCents: null,
	ownerInvolvement: null,
	recurringRevenuePreference: null,
	customerConcentrationMax: null,
	assetPreference: null,
	financingAssumptions: null,
};

const service = new WorkspaceService(db, {
	acquisitionProfileChanged: async () => {
		discoveryRequests += 1;
		return { taskId: crypto.randomUUID(), created: true };
	},
	acquisitionTargetRequested: async () => ({
		taskId: crypto.randomUUID(),
		created: true,
	}),
} as never);

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Buy Box Owner",
			email: `buy-box-${suffix}@example.test`,
		},
	});
	await db.organization.create({
		data: {
			id: organizationId,
			name: "Buy Box Revision",
			slug: `buy-box-${suffix}`,
			createdAt: new Date(),
			members: {
				create: {
					id: crypto.randomUUID(),
					userId,
					role: "owner",
					createdAt: new Date(),
				},
			},
		},
	});
});

afterAll(async () => {
	await db.organization.deleteMany({ where: { id: organizationId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("buy-box revisions", () => {
	it("queues refresh tasks only for targets in the updated workspace", async () => {
		const foreignOrganizationId = `foreign-buy-box-org-${suffix}`;
		const foreignUserId = `foreign-buy-box-user-${suffix}`;
		let companyId = "";
		let foreignCompanyId = "";
		delete process.env.AGENT_BRIDGE_SECRET;

		await db.user.create({
			data: {
				id: foreignUserId,
				name: "Foreign Buy Box Owner",
				email: `foreign-buy-box-${suffix}@example.test`,
			},
		});
		await db.organization.create({
			data: {
				id: foreignOrganizationId,
				name: "Foreign Buy Box Revision",
				slug: `foreign-buy-box-${suffix}`,
				createdAt: new Date(),
				members: {
					create: {
						id: crypto.randomUUID(),
						userId: foreignUserId,
						role: "owner",
						createdAt: new Date(),
					},
				},
			},
		});

		try {
			companyId = await runInOrganization(organizationId, async () => {
				const company = await db.company.create({
					data: {
						name: "Owned Refresh Target",
						domain: `owned-refresh-${suffix}.test`,
						acquisitionTarget: {
							create: {
								stage: AcquisitionStage.DISCOVERED,
								researchedAt: new Date("1900-01-01T00:00:00.000Z"),
								strengths: [],
								concerns: [],
								missingInformation: [],
								sourceUrls: [],
							},
						},
					},
					select: { id: true },
				});
				return company.id;
			});
			foreignCompanyId = await runInOrganization(
				foreignOrganizationId,
				async () => {
					const company = await db.company.create({
						data: {
							name: "Foreign Refresh Target",
							domain: `foreign-refresh-${suffix}.test`,
							acquisitionTarget: {
								create: {
									stage: AcquisitionStage.DISCOVERED,
									researchedAt: new Date("1900-01-02T00:00:00.000Z"),
									strengths: [],
									concerns: [],
									missingInformation: [],
									sourceUrls: [],
								},
							},
						},
						select: { id: true },
					});
					return company.id;
				},
			);

			const realService = new WorkspaceService(db, new AgentTriggerService(db));
			await runInOrganization(organizationId, () =>
				realService.updateAcquisitionProfile(userId, {
					...input,
					customerConcentrationMax: 20,
				}),
			);

			const tasks = await db.$queryRaw<
				Array<{ organizationId: string; companyId: string | null }>
			>`
				SELECT "organizationId", "companyId"
				FROM "agentTask"
				WHERE kind = 'acquisition-refresh'
				AND "companyId" IN (${companyId}, ${foreignCompanyId})
			`;
			expect(tasks).toContainEqual({ organizationId, companyId });
			expect(tasks).not.toContainEqual({
				organizationId,
				companyId: foreignCompanyId,
			});
		} finally {
			await db.$executeRaw`
				DELETE FROM "agentTask"
				WHERE "companyId" IN (${companyId}, ${foreignCompanyId})
			`;
			await runInOrganization(organizationId, () =>
				db.company.deleteMany({ where: { id: companyId } }),
			);
			await db.$executeRaw`
				DELETE FROM "acquisitionProfile" WHERE id = ${organizationId}
			`;
			await runInOrganization(foreignOrganizationId, () =>
				db.company.deleteMany({ where: { id: foreignCompanyId } }),
			);
			await db.organization.deleteMany({
				where: { id: foreignOrganizationId },
			});
			await db.user.deleteMany({ where: { id: foreignUserId } });
		}
	});

	it("increments only for semantic changes", async () => {
		await runInOrganization(organizationId, () =>
			service.updateAcquisitionProfile(userId, input),
		);
		expect(discoveryRequests).toBe(1);

		await runInOrganization(organizationId, () =>
			service.updateAcquisitionProfile(userId, {
				...input,
				preferredIndustries: [" hvac ", "HOME SERVICES"],
			}),
		);
		expect(discoveryRequests).toBe(1);
		expect(
			await db.$queryRaw<Array<{ buyBoxRevision: number }>>`
				SELECT "buyBoxRevision" FROM "acquisitionProfile" WHERE id = ${organizationId}
			`,
		).toEqual([{ buyBoxRevision: 0 }]);

		await runInOrganization(organizationId, () =>
			service.updateAcquisitionProfile(userId, {
				...input,
				customerConcentrationMax: 15,
			}),
		);
		expect(discoveryRequests).toBe(2);
		expect(
			await db.$queryRaw<Array<{ buyBoxRevision: number }>>`
				SELECT "buyBoxRevision" FROM "acquisitionProfile" WHERE id = ${organizationId}
			`,
		).toEqual([{ buyBoxRevision: 1 }]);
	});
});
