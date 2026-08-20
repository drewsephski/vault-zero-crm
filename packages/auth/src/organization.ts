import { db, type Prisma } from "@crm/db";
import {
	uniqueWorkspaceSlug,
	WORKSPACE_ID,
	workspaceSlug,
} from "@crm/db/workspace";

export { WORKSPACE_ID };

export const DEFAULT_WORKSPACE_NAME = "My workspace";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageCurrency(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export async function organizationIdForUser(
	userId: string,
	preferredOrganizationId?: string | null,
): Promise<string | undefined> {
	if (preferredOrganizationId) {
		const preferred = await db.member.findUnique({
			where: {
				organizationId_userId: {
					organizationId: preferredOrganizationId,
					userId,
				},
			},
			select: { organizationId: true },
		});

		if (preferred) return preferred.organizationId;
	}

	const member = await db.member.findFirst({
		where: { userId },
		orderBy: { createdAt: "asc" },
		select: { organizationId: true },
	});

	if (member) return member.organizationId;

	return ensureWorkspaceMembership(userId);
}

export async function ensureWorkspaceMembership(
	userId: string,
	preferredOrganizationId?: string | null,
): Promise<string | undefined> {
	try {
		return await db.$transaction(async (tx) => {
			const existing = preferredOrganizationId
				? await tx.member.findUnique({
						where: {
							organizationId_userId: {
								organizationId: preferredOrganizationId,
								userId,
							},
						},
						select: { organizationId: true },
					})
				: null;
			const membership =
				existing ??
				(await tx.member.findFirst({
					where: { userId },
					orderBy: { createdAt: "asc" },
					select: { organizationId: true },
				}));

			if (membership) {
				await repairOwner(tx, membership.organizationId);
				const workspace = await tx.organization.findUnique({
					where: { id: membership.organizationId },
					select: { id: true, name: true, slug: true },
				});

				if (workspace) {
					const slug = workspaceSlug(workspace.name);
					if (workspace.slug !== slug) {
						const taken = await tx.organization.findFirst({
							where: { slug, id: { not: workspace.id } },
							select: { id: true },
						});
						if (!taken) {
							await tx.organization.update({
								where: { id: workspace.id },
								data: { slug },
							});
						}
					}
				}

				return membership.organizationId;
			}

			const user = await tx.user.findUnique({
				where: { id: userId },
				select: { name: true },
			});

			const name = user?.name.trim() || DEFAULT_WORKSPACE_NAME;
			const slug = await uniqueWorkspaceSlug(
				async (candidate) =>
					Boolean(
						await tx.organization.findUnique({
							where: { slug: candidate },
							select: { id: true },
						}),
					),
				name,
				userId,
			);

			const organization = await tx.organization.create({
				data: {
					id: crypto.randomUUID(),
					name,
					slug,
					createdAt: new Date(),
				},
				select: { id: true },
			});

			await tx.member.create({
				data: {
					id: crypto.randomUUID(),
					organizationId: organization.id,
					userId,
					role: "owner",
					createdAt: new Date(),
				},
			});

			return organization.id;
		});
	} catch (error) {
		console.error(
			`[auth] could not create a workspace for user ${userId}; the next sign-in will retry`,
			error,
		);
		return undefined;
	}
}

async function repairOwner(
	tx: Prisma.TransactionClient,
	organizationId: string,
): Promise<void> {
	const owner = await tx.member.findFirst({
		where: { organizationId, role: "owner" },
		select: { id: true },
	});

	if (owner) return;

	const earliest = await tx.member.findFirst({
		where: { organizationId },
		orderBy: [{ user: { createdAt: "asc" } }, { userId: "asc" }],
		select: { id: true },
	});

	if (earliest) {
		await tx.member.update({
			where: { id: earliest.id },
			data: { role: "owner" },
		});
	}
}
