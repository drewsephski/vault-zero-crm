import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";
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
