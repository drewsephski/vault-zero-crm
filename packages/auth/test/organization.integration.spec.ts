import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { acquireCanonicalWorkspaceFixture } from "../../db/test/canonical-workspace-fixture";
import { ensureWorkspaceMembership, WORKSPACE_ID } from "../src/organization";

const suffix = process.env.TEST_RUN_ID ?? "organization-spec";

const emailOf = (label: string) => `${label}.${suffix}@example.test`;

type Snapshot = {
	organization: {
		name: string;
		slug: string;
		website: string | null;
		metadata: string | null;
	} | null;
	members: { id: string; userId: string; role: string; createdAt: Date }[];
};

let snapshot: Snapshot;
let firstId: string;
let secondId: string;
let releaseCanonicalWorkspace: (() => Promise<void>) | undefined;

const seedUser = async (label: string, createdAt: Date): Promise<string> => {
	const user = await db.user.create({
		data: {
			id: `${suffix}-${label}`,
			name: label,
			email: emailOf(label),
			createdAt,
			updatedAt: createdAt,
		},
		select: { id: true },
	});

	return user.id;
};

const membershipOf = async (userId: string) => {
	return db.member.findFirst({
		where: { userId },
		select: { organizationId: true, role: true },
	});
};

const clear = async () => {
	const users = await db.user.findMany({
		where: { email: { endsWith: `.${suffix}@example.test` } },
		select: { id: true },
	});
	const userIds = users.map((user) => user.id);

	if (userIds.length > 0) {
		const memberships = await db.member.findMany({
			where: { userId: { in: userIds } },
			select: { organizationId: true },
		});
		const organizationIds = [
			...new Set(
				memberships
					.map((row) => row.organizationId)
					.filter((id) => id !== WORKSPACE_ID),
			),
		];

		await db.member.deleteMany({ where: { userId: { in: userIds } } });
		if (organizationIds.length > 0) {
			await db.organization.deleteMany({
				where: { id: { in: organizationIds } },
			});
		}
		await db.user.deleteMany({ where: { id: { in: userIds } } });
	}
};

beforeAll(async () => {
	releaseCanonicalWorkspace = await acquireCanonicalWorkspaceFixture();
	const organization = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { name: true, slug: true, website: true, metadata: true },
	});

	snapshot = {
		organization,
		members: await db.member.findMany({
			where: { organizationId: WORKSPACE_ID },
			select: { id: true, userId: true, role: true, createdAt: true },
		}),
	};
}, 120_000);

beforeEach(async () => {
	await clear();

	firstId = await seedUser("first", new Date("2020-01-01T00:00:00Z"));
	secondId = await seedUser("second", new Date("2021-01-01T00:00:00Z"));
});

afterAll(async () => {
	try {
		await clear();

		if (snapshot.organization) {
			await db.organization.create({
				data: {
					id: WORKSPACE_ID,
					createdAt: new Date(),
					...snapshot.organization,
				},
			});

			await db.member.createMany({
				data: snapshot.members.map((member) => ({
					...member,
					organizationId: WORKSPACE_ID,
				})),
			});
		}
	} finally {
		await releaseCanonicalWorkspace?.();
	}
});

describe("ensureWorkspaceMembership", () => {
	it("gives a new user their own workspace as owner", async () => {
		const workspaceId = await ensureWorkspaceMembership(firstId);
		const membership = await membershipOf(firstId);

		expect(workspaceId).toBeDefined();
		expect(workspaceId).not.toBe(WORKSPACE_ID);
		expect(membership?.organizationId).toBe(workspaceId);
		expect(membership?.role).toBe("owner");
	});

	it("does not put two new users in the same workspace", async () => {
		const firstWorkspace = await ensureWorkspaceMembership(firstId);
		const secondWorkspace = await ensureWorkspaceMembership(secondId);

		expect(firstWorkspace).toBeDefined();
		expect(secondWorkspace).toBeDefined();
		expect(firstWorkspace).not.toBe(secondWorkspace);
		expect(await membershipOf(firstId)).toMatchObject({
			organizationId: firstWorkspace,
			role: "owner",
		});
		expect(await membershipOf(secondId)).toMatchObject({
			organizationId: secondWorkspace,
			role: "owner",
		});
	});

	it("is idempotent, so signing in again neither duplicates nor re-roles", async () => {
		const workspaceId = await ensureWorkspaceMembership(secondId);
		if (!workspaceId) throw new Error("expected a workspace");

		await db.member.update({
			where: {
				organizationId_userId: {
					organizationId: workspaceId,
					userId: secondId,
				},
			},
			data: { role: "admin" },
		});

		await ensureWorkspaceMembership(secondId);
		await ensureWorkspaceMembership(secondId);

		const rows = await db.member.findMany({
			where: { organizationId: workspaceId, userId: secondId },
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.role).toBe("admin");
	});

	it("keeps someone who already belongs to the shared workspace there", async () => {
		await db.organization.upsert({
			where: { id: WORKSPACE_ID },
			create: {
				id: WORKSPACE_ID,
				name: "Vault Zero",
				slug: "workspace",
				createdAt: new Date(),
			},
			update: {},
		});

		await db.member.create({
			data: {
				id: crypto.randomUUID(),
				organizationId: WORKSPACE_ID,
				userId: firstId,
				role: "owner",
				createdAt: new Date(),
			},
		});

		expect(await ensureWorkspaceMembership(firstId)).toBe(WORKSPACE_ID);
		expect(await membershipOf(firstId)).toMatchObject({
			organizationId: WORKSPACE_ID,
			role: "owner",
		});
	});

	it("repairs an ownerless workspace by promoting its earliest member", async () => {
		const workspaceId = await ensureWorkspaceMembership(secondId);
		if (!workspaceId) throw new Error("expected a workspace");

		await db.member.updateMany({
			where: { organizationId: workspaceId },
			data: { role: "member" },
		});

		await ensureWorkspaceMembership(secondId);

		expect(await membershipOf(secondId)).toMatchObject({
			organizationId: workspaceId,
			role: "owner",
		});
	});
});
