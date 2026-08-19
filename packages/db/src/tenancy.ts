import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "./generated/prisma/client";
import { WORKSPACE_ID } from "./workspace";

const storage = new AsyncLocalStorage<string>();

export const TENANT_MODELS = new Set([
	"Company",
	"Contact",
	"Deal",
	"AgentTask",
	"AcquisitionCandidate",
	"OutreachLead",
	"AgentConversation",
]);

const PROFILE_MODELS = new Set(["AcquisitionProfile", "WorkspaceProfile"]);

const UNIQUE_BY_DOMAIN = new Set(["Company", "AcquisitionCandidate"]);
const UNIQUE_BY_EMAIL = new Set(["Contact", "OutreachLead"]);

export function runInOrganization<T>(organizationId: string, fn: () => T): T {
	return storage.run(organizationId, fn);
}

export function getOrganizationId(): string | undefined {
	return storage.getStore();
}

export function requireOrganizationId(): string {
	const organizationId = storage.getStore();
	if (!organizationId) {
		throw new Error(
			"This operation needs a workspace. Sign in again in a moment.",
		);
	}
	return organizationId;
}

function assertTenantScope(
	model: string,
	operation: string,
): string | undefined {
	const organizationId = storage.getStore();
	if (organizationId) return organizationId;

	const scoped = TENANT_MODELS.has(model) || PROFILE_MODELS.has(model);
	if (!scoped) return undefined;
	if (process.env.NODE_ENV === "test") return WORKSPACE_ID;

	throw new Error(
		`Refusing ${operation} on ${model} without a workspace scope.`,
	);
}

export function tenantDomainWhere(domain: string) {
	return {
		organizationId_domain: {
			organizationId: requireOrganizationId(),
			domain,
		},
	};
}

export function tenantEmailWhere(email: string) {
	return {
		organizationId_email: {
			organizationId: requireOrganizationId(),
			email,
		},
	};
}

type QueryArgs = {
	where?: Record<string, unknown>;
	data?: Record<string, unknown> | Record<string, unknown>[];
	create?: Record<string, unknown>;
	update?: Record<string, unknown>;
};

function withOrganizationWhere(
	where: Record<string, unknown> | undefined,
	organizationId: string,
): Record<string, unknown> {
	return { ...where, organizationId };
}

function withOrganizationData(
	data: Record<string, unknown> | undefined,
	organizationId: string,
): Record<string, unknown> {
	return { ...data, organizationId };
}

function rewriteUniqueWhere(
	model: string,
	where: Record<string, unknown>,
	organizationId: string,
): Record<string, unknown> {
	if (typeof where.domain === "string" && UNIQUE_BY_DOMAIN.has(model)) {
		const { domain, ...rest } = where;
		return {
			...rest,
			organizationId_domain: { organizationId, domain },
		};
	}

	if (typeof where.email === "string" && UNIQUE_BY_EMAIL.has(model)) {
		const { email, ...rest } = where;
		return {
			...rest,
			organizationId_email: { organizationId, email },
		};
	}

	return withOrganizationWhere(where, organizationId);
}

export function applyTenancy<Client extends PrismaClient>(
	client: Client,
): Client {
	return client.$extends({
		query: {
			$allModels: {
				async $allOperations({ model, operation, args, query }) {
					const organizationId = assertTenantScope(model, operation);
					if (!organizationId) return query(args);

					if (PROFILE_MODELS.has(model)) {
						const scoped = args as QueryArgs;
						if (scoped.where && "id" in scoped.where) {
							scoped.where = { ...scoped.where, id: organizationId };
						}
						if (scoped.create && "id" in scoped.create) {
							scoped.create = { ...scoped.create, id: organizationId };
						}
						return query(scoped);
					}

					if (!TENANT_MODELS.has(model)) return query(args);

					const scoped = args as QueryArgs;

					if (
						operation === "findUnique" ||
						operation === "findUniqueOrThrow" ||
						operation === "upsert"
					) {
						scoped.where = rewriteUniqueWhere(
							model,
							scoped.where ?? {},
							organizationId,
						);
					} else if (scoped.where) {
						scoped.where = withOrganizationWhere(scoped.where, organizationId);
					}

					if (
						operation === "create" &&
						scoped.data &&
						!Array.isArray(scoped.data)
					) {
						scoped.data = withOrganizationData(scoped.data, organizationId);
					}

					if (
						(operation === "createMany" ||
							operation === "createManyAndReturn") &&
						Array.isArray(scoped.data)
					) {
						scoped.data = scoped.data.map((row) =>
							withOrganizationData(row, organizationId),
						);
					}

					if (operation === "upsert") {
						scoped.create = withOrganizationData(scoped.create, organizationId);
					}

					if (
						(operation === "findUnique" || operation === "findUniqueOrThrow") &&
						scoped.where &&
						"organizationId" in scoped.where &&
						!("organizationId_domain" in scoped.where) &&
						!("organizationId_email" in scoped.where)
					) {
						const next =
							operation === "findUnique" ? "findFirst" : "findFirstOrThrow";
						const delegate = `${model[0]?.toLowerCase() ?? ""}${model.slice(1)}`;
						const run = (
							client as unknown as Record<
								string,
								Record<string, (value: unknown) => Promise<unknown>>
							>
						)[delegate]?.[next];
						if (!run) {
							throw new Error(
								`Cannot scope ${operation} on ${model} to a workspace.`,
							);
						}
						return run(scoped);
					}

					return query(scoped);
				},
			},
		},
	}) as unknown as Client;
}
