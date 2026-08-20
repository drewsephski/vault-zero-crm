import type { SessionContext } from "eve/context";
import type { ToolContext } from "eve/tools";
import { db } from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";

type ScopedAuth = SessionContext["session"]["auth"] | ToolContext["session"]["auth"];

export function organizationIdFromAuth(auth: ScopedAuth | undefined): string | null {
	const current = auth?.current ?? auth?.initiator;
	const organizationId = current?.attributes?.organizationId;
	return typeof organizationId === "string" && organizationId.trim()
		? organizationId.trim()
		: null;
}

export function requireOrganizationId(auth: ScopedAuth | undefined): string {
	const organizationId = organizationIdFromAuth(auth);
	if (!organizationId) {
		throw new Error("This session has no workspace scope.");
	}
	return organizationId;
}

export function withOrganizationScope<T>(
	auth: ScopedAuth | undefined,
	fn: () => T,
): T {
	return runInOrganization(requireOrganizationId(auth), fn);
}

export async function withOrganizationScopeAsync<T>(
	ctx: Pick<SessionContext, "session"> | Pick<ToolContext, "session">,
	fn: () => Promise<T>,
): Promise<T> {
	return runInOrganization(requireOrganizationId(ctx.session.auth), fn);
}

export async function taskOrganizationId(
	taskId: string,
): Promise<string | null> {
	const rows = await db.$queryRaw<{ organizationId: string }[]>`
		SELECT "organizationId" FROM "agentTask" WHERE id = ${taskId}
	`;
	return rows[0]?.organizationId ?? null;
}

export async function withTaskOrganizationScope<T>(
	taskId: string,
	fn: () => Promise<T>,
): Promise<T | null> {
	const organizationId = await taskOrganizationId(taskId);
	if (!organizationId) return null;
	return runInOrganization(organizationId, fn);
}
