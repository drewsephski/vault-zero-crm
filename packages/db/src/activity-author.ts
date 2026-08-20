import type { Db } from "./client";
import type { Prisma } from "./generated/prisma/client";
import { requireOrganizationId } from "./tenancy";

type ActivityAuthorClient = Db | Prisma.TransactionClient;

export async function resolveAutomatedActivityAuthor(
	database: ActivityAuthorClient,
	preferredUserIds: readonly (string | null | undefined)[] = [],
): Promise<string | null> {
	const organizationId = requireOrganizationId();
	const preferred = [...new Set(preferredUserIds.filter(Boolean))] as string[];

	if (preferred.length > 0) {
		const members = await database.member.findMany({
			where: { organizationId, userId: { in: preferred } },
			select: { userId: true },
		});
		const memberIds = new Set(members.map((member) => member.userId));
		const matched = preferred.find((userId) => memberIds.has(userId));
		if (matched) return matched;
	}

	const owner = await database.member.findFirst({
		where: { organizationId, role: "owner" },
		orderBy: [{ user: { createdAt: "asc" } }, { userId: "asc" }],
		select: { userId: true },
	});
	if (owner) return owner.userId;

	const member = await database.member.findFirst({
		where: { organizationId },
		orderBy: [{ user: { createdAt: "asc" } }, { userId: "asc" }],
		select: { userId: true },
	});
	return member?.userId ?? null;
}
