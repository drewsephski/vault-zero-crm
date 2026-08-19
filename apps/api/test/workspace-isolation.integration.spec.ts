import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { acquireCanonicalWorkspaceFixture } from "../../../packages/db/test/canonical-workspace-fixture";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { companyListInput } from "../src/companies/companies.contracts";
import { CompaniesService } from "../src/companies/companies.service";
import { UsersService } from "../src/users/users.service";

const suffix = process.env.TEST_RUN_ID ?? "workspace-isolation";
const domainA = `iso-a.${suffix}.example`;
const domainB = `iso-b.${suffix}.example`;

let releaseCanonicalWorkspace: (() => Promise<void>) | undefined;
let orgA = "";
let orgB = "";

function companies() {
	delete process.env.AGENT_BRIDGE_SECRET;
	return new CompaniesService(
		db,
		new AgentTriggerService(db),
		new AgentQueueService(db),
		{ backfill: async () => null } as never,
		{} as never,
		{ reportingCurrency: async () => "USD" } as never,
	);
}

const listInput = companyListInput.parse({});

beforeAll(async () => {
	releaseCanonicalWorkspace = await acquireCanonicalWorkspaceFixture();

	const [a, b] = await Promise.all([
		db.organization.create({
			data: {
				id: crypto.randomUUID(),
				name: "Isolation A",
				slug: `iso-a-${suffix}`,
				createdAt: new Date(),
			},
			select: { id: true },
		}),
		db.organization.create({
			data: {
				id: crypto.randomUUID(),
				name: "Isolation B",
				slug: `iso-b-${suffix}`,
				createdAt: new Date(),
			},
			select: { id: true },
		}),
	]);

	orgA = a.id;
	orgB = b.id;
}, 120_000);

afterAll(async () => {
	try {
		await db.company.deleteMany({
			where: { domain: { in: [domainA, domainB] } },
		});
		await db.organization.deleteMany({
			where: { id: { in: [orgA, orgB].filter(Boolean) } },
		});
	} finally {
		await releaseCanonicalWorkspace?.();
	}
});

describe("workspace data isolation", () => {
	it("does not list another workspace's companies", async () => {
		const service = companies();

		await runInOrganization(orgA, () =>
			service.create({ name: "Alpha Isolation", domain: domainA }),
		);
		await runInOrganization(orgB, () =>
			service.create({ name: "Beta Isolation", domain: domainB }),
		);

		const listedA = await runInOrganization(orgA, () =>
			service.list(listInput),
		);
		const listedB = await runInOrganization(orgB, () =>
			service.list(listInput),
		);

		expect(listedA.rows.some((row) => row.domain === domainA)).toBe(true);
		expect(listedA.rows.some((row) => row.domain === domainB)).toBe(false);
		expect(listedB.rows.some((row) => row.domain === domainB)).toBe(true);
		expect(listedB.rows.some((row) => row.domain === domainA)).toBe(false);
		expect(orgA).not.toBe(WORKSPACE_ID);
		expect(orgB).not.toBe(WORKSPACE_ID);
	});

	it("does not list people from another workspace", async () => {
		const users = new UsersService(db);
		const [userA, userB] = await Promise.all([
			db.user.create({
				data: {
					id: `iso-user-a-${suffix}`,
					name: "Isolation A Owner",
					email: `iso-a.${suffix}@example.test`,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				select: { id: true, email: true },
			}),
			db.user.create({
				data: {
					id: `iso-user-b-${suffix}`,
					name: "Isolation B Owner",
					email: `iso-b.${suffix}@example.test`,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				select: { id: true, email: true },
			}),
		]);

		await Promise.all([
			db.member.create({
				data: {
					id: crypto.randomUUID(),
					organizationId: orgA,
					userId: userA.id,
					role: "owner",
					createdAt: new Date(),
				},
			}),
			db.member.create({
				data: {
					id: crypto.randomUUID(),
					organizationId: orgB,
					userId: userB.id,
					role: "owner",
					createdAt: new Date(),
				},
			}),
		]);

		const listedA = await users.list(orgA);
		const listedB = await users.list(orgB);

		try {
			expect(listedA.some((row) => row.email === userA.email)).toBe(true);
			expect(listedA.some((row) => row.email === userB.email)).toBe(false);
			expect(listedB.some((row) => row.email === userB.email)).toBe(true);
			expect(listedB.some((row) => row.email === userA.email)).toBe(false);
		} finally {
			await db.member.deleteMany({
				where: { userId: { in: [userA.id, userB.id] } },
			});
			await db.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
		}
	});
});
