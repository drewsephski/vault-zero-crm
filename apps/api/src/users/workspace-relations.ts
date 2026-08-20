import type { Db } from "@crm/db";
import { getOrganizationId } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { BadRequestException } from "@nestjs/common";

export async function assertWorkspaceMember(
	database: Db,
	userId: string | null | undefined,
): Promise<void> {
	if (!userId) return;

	const member = await database.member.findFirst({
		where: {
			organizationId: getOrganizationId() ?? WORKSPACE_ID,
			userId,
		},
		select: { id: true },
	});

	if (!member) {
		throw new BadRequestException("That owner is not in this workspace.");
	}
}

export async function assertWorkspaceCompany(
	database: Db,
	companyId: string | null | undefined,
): Promise<void> {
	if (!companyId) return;

	const company = await database.company.findUnique({
		where: { id: companyId },
		select: { id: true },
	});

	if (!company) {
		throw new BadRequestException("That company is not in this workspace.");
	}
}
