import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";
import { writeTimelineNote } from "../agent/lib/crm";

const suffix = crypto.randomUUID();
const organizationId = `activity-author-org-${suffix}`;
const otherOrganizationId = `activity-author-other-org-${suffix}`;
const ownerId = `activity-author-owner-${suffix}`;
const outsiderId = `activity-author-outsider-${suffix}`;
let contactId = "";

beforeAll(async () => {
	await db.organization.createMany({
		data: [
			{
				id: organizationId,
				name: "Activity Author Workspace",
				slug: organizationId,
				createdAt: new Date(),
			},
			{
				id: otherOrganizationId,
				name: "Other Activity Author Workspace",
				slug: otherOrganizationId,
				createdAt: new Date(),
			},
		],
	});
	await db.user.createMany({
		data: [
			{
				id: ownerId,
				name: "Workspace Owner",
				email: `${ownerId}@example.test`,
				emailVerified: true,
			},
			{
				id: outsiderId,
				name: "Other Workspace Owner",
				email: `${outsiderId}@example.test`,
				emailVerified: true,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `activity-author-owner-member-${suffix}`,
				organizationId,
				userId: ownerId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: `activity-author-outsider-member-${suffix}`,
				organizationId: otherOrganizationId,
				userId: outsiderId,
				role: "owner",
				createdAt: new Date(),
			},
		],
	});
	await runInOrganization(organizationId, async () => {
		const contact = await db.contact.create({
			data: {
				firstName: "Unsafe Owner",
				ownerId: outsiderId,
			},
			select: { id: true },
		});
		contactId = contact.id;
	});
});

afterAll(async () => {
	await runInOrganization(organizationId, async () => {
		await db.activity.deleteMany({ where: { contactId } });
		await db.contact.deleteMany({ where: { id: contactId } });
	});
	await db.member.deleteMany({
		where: { organizationId: { in: [organizationId, otherOrganizationId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
	await db.organization.deleteMany({
		where: { id: { in: [organizationId, otherOrganizationId] } },
	});
});

describe("automated activity attribution", () => {
	it("rejects a record owner from another workspace and uses the workspace owner", async () => {
		const activityId = await runInOrganization(organizationId, () =>
			writeTimelineNote(contactId, "Research note", "Evidence-backed update"),
		);

		const activity = await db.activity.findUniqueOrThrow({
			where: { id: activityId ?? "" },
			select: { createdById: true },
		});
		expect(activity.createdById).toBe(ownerId);
	});
});
