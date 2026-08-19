import {
	auth,
	canConfigureSso,
	isGoogleConfigured,
	isMicrosoftConfigured,
	isWorkspaceRole,
	ssoCallbackBase,
	ssoCallbackURL,
	ssoProviderName,
	type WorkspaceRole,
} from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	HttpException,
	Injectable,
	InternalServerErrorException,
	Logger,
} from "@nestjs/common";
import { APIError } from "better-auth/api";
import { InjectDatabase } from "../database/database.constants";
import { type ListResult, paginate, resolveOrderBy } from "../trpc/list-input";
import type {
	DeleteSsoProviderInput,
	RegisterSsoProviderInput,
	SsoProviderListInput,
} from "./sso.contracts";

export interface PublicSsoProvider {
	providerId: string;
	name: string;
}

export interface SignInOptions {
	google: boolean;
	microsoft: boolean;
	providers: PublicSsoProvider[];
}

export interface SsoProvider {
	providerId: string;
	name: string;
	type: "oidc" | "saml";
	issuer: string;
	domains: string[];
	clientIdLastFour: string | null;
	callbackURL: string;
}

export interface SsoSettings {
	canConfigure: boolean;
	callbackBase: string;
}

const PROVIDER_SELECT = {
	providerId: true,
	issuer: true,
	domain: true,
	oidcConfig: true,
	samlConfig: true,
} satisfies Prisma.SsoProviderSelect;

type ProviderRow = Prisma.SsoProviderGetPayload<{
	select: typeof PROVIDER_SELECT;
}>;

const SORTABLE: Record<
	string,
	(dir: "asc" | "desc") => Prisma.SsoProviderOrderByWithRelationInput
> = {
	providerId: (dir) => ({ providerId: dir }),
	domain: (dir) => ({ domain: dir }),
	issuer: (dir) => ({ issuer: dir }),
};

const STATUS_BY_CODE: Record<string, number> = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	UNPROCESSABLE_ENTITY: 400,
};

function splitDomains(value: string): string[] {
	return value
		.split(",")
		.map((part) =>
			part
				.trim()
				.replace(/^https?:\/\//i, "")
				.replace(/\/.*$/, ""),
		)
		.map((part) => part.toLowerCase())
		.filter(Boolean);
}

function lastFour(clientId: unknown): string | null {
	return typeof clientId === "string" && clientId.length >= 4
		? clientId.slice(-4)
		: null;
}

function parseConfig(value: string | null): Record<string, unknown> | null {
	if (!value) return null;

	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function toProvider(row: ProviderRow): SsoProvider {
	const oidc = parseConfig(row.oidcConfig);

	return {
		providerId: row.providerId,
		name: ssoProviderName(row.providerId),
		type: row.samlConfig ? "saml" : "oidc",
		issuer: row.issuer,
		domains: splitDomains(row.domain),
		clientIdLastFour: oidc ? lastFour(oidc.clientId) : null,
		callbackURL: ssoCallbackURL(row.providerId),
	};
}

@Injectable()
export class SsoService {
	private readonly logger = new Logger(SsoService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async signInOptions(): Promise<SignInOptions> {
		const rows = await this.db.ssoProvider.findMany({
			select: { providerId: true },
			orderBy: { providerId: "asc" },
		});

		return {
			google: isGoogleConfigured(),
			microsoft: isMicrosoftConfigured(),
			providers: rows.map((row) => ({
				providerId: row.providerId,
				name: ssoProviderName(row.providerId),
			})),
		};
	}

	async settings(userId: string): Promise<SsoSettings> {
		return {
			canConfigure: canConfigureSso(await this.roleOf(userId)),
			callbackBase: ssoCallbackBase(),
		};
	}

	async list(
		userId: string,
		input: SsoProviderListInput,
	): Promise<ListResult<SsoProvider>> {
		const where = await this.searchWhere(input.q, userId);
		const { skip, take } = paginate(input);

		const [rows, total] = await Promise.all([
			this.db.ssoProvider.findMany({
				where,
				skip,
				take,
				select: PROVIDER_SELECT,
				orderBy: resolveOrderBy(input, SORTABLE, { providerId: "asc" }),
			}),
			this.db.ssoProvider.count({ where }),
		]);

		return { rows: rows.map(toProvider), total, facetCounts: {} };
	}

	async register(
		userId: string,
		headers: Headers,
		input: RegisterSsoProviderInput,
	): Promise<SsoProvider> {
		await this.requireConfigurer(userId);

		const domains = splitDomains(input.domain);

		if (domains.length === 0) {
			throw new BadRequestException(
				"Give the email domain your people sign in with, for example acme.com.",
			);
		}

		const membership = await this.membershipOf(userId);
		if (!membership) {
			throw new InternalServerErrorException(
				"Your workspace could not be created. Sign in again in a moment.",
			);
		}

		await this.call(() =>
			auth.api.registerSSOProvider({
				headers,
				body: {
					providerId: input.providerId,
					issuer: input.issuer,
					domain: domains.join(","),
					organizationId: membership.organizationId,
					oidcConfig: {
						clientId: input.clientId,
						clientSecret: input.clientSecret,
						pkce: true,
					},
				},
			}),
		);

		this.logger.log({
			message: "SSO provider registered",
			userId,
			providerId: input.providerId,
			issuer: input.issuer,
		});

		const row = await this.db.ssoProvider.findUniqueOrThrow({
			where: { providerId: input.providerId },
			select: PROVIDER_SELECT,
		});

		return toProvider(row);
	}

	async remove(
		userId: string,
		headers: Headers,
		input: DeleteSsoProviderInput,
	): Promise<{ providerId: string }> {
		await this.requireConfigurer(userId);

		await this.call(() =>
			auth.api.deleteSSOProvider({
				headers,
				body: { providerId: input.providerId },
			}),
		);

		this.logger.log({
			message: "SSO provider removed",
			userId,
			providerId: input.providerId,
		});

		return { providerId: input.providerId };
	}

	private async searchWhere(
		q: string,
		userId: string,
	): Promise<Prisma.SsoProviderWhereInput> {
		const membership = await this.membershipOf(userId);
		const term = q.trim();
		const where: Prisma.SsoProviderWhereInput = {
			organizationId: membership?.organizationId ?? "__none__",
		};

		if (term) {
			where.OR = [
				{ providerId: { contains: term, mode: "insensitive" } },
				{ domain: { contains: term, mode: "insensitive" } },
				{ issuer: { contains: term, mode: "insensitive" } },
			];
		}

		return where;
	}

	private async call<T>(run: () => Promise<T>): Promise<T> {
		try {
			return await run();
		} catch (error) {
			if (error instanceof APIError) {
				const status =
					STATUS_BY_CODE[error.body?.code ?? ""] ?? error.statusCode;

				throw new HttpException(
					error.body?.message ?? "The identity provider could not be saved.",
					typeof status === "number" ? status : 400,
				);
			}

			this.logger.error(
				{ message: "SSO provider call failed" },
				error instanceof Error ? error.stack : String(error),
			);

			throw new InternalServerErrorException(
				"Could not reach the identity provider.",
			);
		}
	}

	private async requireConfigurer(userId: string): Promise<void> {
		if (!canConfigureSso(await this.roleOf(userId))) {
			throw new ForbiddenException(
				"Only an owner or an admin can change how people sign in.",
			);
		}
	}

	private async membershipOf(userId: string) {
		return this.db.member.findFirst({
			where: { userId },
			orderBy: { createdAt: "asc" },
			select: { role: true, organizationId: true },
		});
	}

	private async roleOf(userId: string): Promise<WorkspaceRole | null> {
		const member = await this.membershipOf(userId);
		if (!member) return null;

		return isWorkspaceRole(member.role) ? member.role : "member";
	}
}
