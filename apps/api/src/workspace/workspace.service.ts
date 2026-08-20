import {
	canChangeRole,
	canRenameWorkspace,
	isWorkspaceRole,
	organizationIdForUser,
	type WorkspaceRole,
} from "@crm/auth";
import {
	AcquisitionAssetPreference,
	AcquisitionOwnerInvolvement,
	AcquisitionRevenuePreference,
	type Db,
	type Prisma,
	WorkspaceMode,
} from "@crm/db";
import { isDiscoveryReady, isDossierReady } from "@crm/db/acquisition";
import {
	acquisitionProfileChanged,
	withAcquisitionProfileLock,
} from "@crm/db/acquisition-profile-revision";
import { acquisitionRefreshTargetIds } from "@crm/db/acquisition-refresh";
import { readReportingCurrency } from "@crm/db/settings";
import { getOrganizationId } from "@crm/db/tenancy";
import {
	isOnboarded,
	markOnboarded,
	uniqueWorkspaceSlug,
	workspaceSlug,
} from "@crm/db/workspace";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { normalizeDomain } from "../companies/domain";
import { blankToNull, decimalFromCents, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	FACET_ALL,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	CreateWorkspaceInput,
	MemberListInput,
	SetMemberRoleInput,
	SetWorkspaceModeInput,
	UpdateAcquisitionProfileInput,
	UpdateWorkspaceInput,
} from "./workspace.contracts";

export interface Workspace {
	id: string;
	slug: string;
	name: string;
	website: string | null;
	onboarded: boolean;
	viewerRole: WorkspaceRole | null;
	canRename: boolean;
	canChangeRoles: boolean;
	canManageAcquisition: boolean;
	mode: WorkspaceMode;
}

export interface AcquisitionProfile {
	mode: WorkspaceMode;
	preferredIndustries: string[];
	geographies: string[];
	excludedCategories: string[];
	currency: string;
	revenueMinCents: number | null;
	revenueMaxCents: number | null;
	ebitdaMinCents: number | null;
	ebitdaMaxCents: number | null;
	purchasePriceMinCents: number | null;
	purchasePriceMaxCents: number | null;
	ownerInvolvement: AcquisitionOwnerInvolvement | null;
	recurringRevenuePreference: AcquisitionRevenuePreference | null;
	customerConcentrationMax: number | null;
	assetPreference: AcquisitionAssetPreference | null;
	financingAssumptions: string | null;
	updatedAt: string | null;
	canManage: boolean;
}

export interface WorkspaceMember {
	id: string;
	userId: string;
	name: string;
	email: string;
	image: string | null;
	role: WorkspaceRole;
	joinedAt: string;
	isViewer: boolean;
}

const MEMBER_SELECT = {
	id: true,
	role: true,
	createdAt: true,
	userId: true,
	user: { select: { name: true, email: true, image: true } },
} as const;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_SELECT }>;

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.MemberOrderByWithRelationInput
> = {
	name: (dir) => ({ user: { name: dir } }),
	email: (dir) => ({ user: { email: dir } }),
	role: (dir) => ({ role: dir }),
	joinedAt: (dir) => ({ createdAt: dir }),
};

function toRole(value: string): WorkspaceRole {
	return isWorkspaceRole(value) ? value : "member";
}

export function hasDiscoveryFocus(input: {
	preferredIndustries: readonly string[];
	geographies: readonly string[];
}): boolean {
	return isDiscoveryReady(input);
}

@Injectable()
export class WorkspaceService {
	private readonly logger = new Logger(WorkspaceService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async list(userId: string, activeOrganizationId: string) {
		const rows = await this.db.member.findMany({
			where: { userId },
			orderBy: { createdAt: "asc" },
			select: {
				organizationId: true,
				role: true,
				organization: { select: { name: true, slug: true } },
			},
		});

		return rows.map((row) => ({
			id: row.organizationId,
			name: row.organization.name,
			slug: row.organization.slug,
			role: row.role,
			active: row.organizationId === activeOrganizationId,
		}));
	}

	async create(userId: string, sessionId: string, input: CreateWorkspaceInput) {
		const website = normalizeDomain(input.website);

		if (input.website !== null && !website) {
			throw new BadRequestException(
				"That is not a website. Enter the domain, like acme.com.",
			);
		}

		const slug = await uniqueWorkspaceSlug(
			async (candidate) =>
				Boolean(
					await this.db.organization.findUnique({
						where: { slug: candidate },
						select: { id: true },
					}),
				),
			input.name,
			userId,
		);
		const organizationId = crypto.randomUUID();

		await this.db.$transaction([
			this.db.organization.create({
				data: {
					id: organizationId,
					name: input.name,
					slug,
					website,
					metadata: markOnboarded(null, new Date()),
					createdAt: new Date(),
				},
			}),
			this.db.member.create({
				data: {
					id: crypto.randomUUID(),
					organizationId,
					userId,
					role: "owner",
					createdAt: new Date(),
				},
			}),
			this.db.session.update({
				where: { id: sessionId },
				data: { activeOrganizationId: organizationId },
			}),
		]);

		return { id: organizationId, name: input.name, slug };
	}

	async switch(userId: string, sessionId: string, organizationId: string) {
		const membership = await this.db.member.findUnique({
			where: {
				organizationId_userId: { organizationId, userId },
			},
			select: {
				organization: { select: { slug: true } },
			},
		});

		if (!membership) {
			throw new NotFoundException("That workspace is not available.");
		}

		await this.db.session.update({
			where: { id: sessionId },
			data: { activeOrganizationId: organizationId },
		});

		return { id: organizationId, slug: membership.organization.slug };
	}

	async get(userId: string): Promise<Workspace> {
		const workspaceId = await this.requireWorkspaceId(userId);
		const row = await this.readWorkspace(workspaceId);

		if (!row) {
			throw new ServiceUnavailableException(
				"The workspace could not be read. Sign in again in a moment.",
			);
		}

		const [role, acquisition] = await Promise.all([
			this.roleOf(userId, workspaceId),
			this.db.acquisitionProfile.findUnique({
				where: { id: workspaceId },
				select: { mode: true },
			}),
		]);

		return {
			id: row.id,
			slug: row.slug,
			name: row.name,
			website: row.website,
			onboarded: isOnboarded(row.metadata),
			viewerRole: role,
			canRename: canRenameWorkspace(role),
			canChangeRoles: canChangeRole(role),
			canManageAcquisition: canRenameWorkspace(role),
			mode: acquisition?.mode ?? WorkspaceMode.SALES,
		};
	}

	async acquisitionProfile(userId: string): Promise<AcquisitionProfile> {
		const workspaceId = await this.requireWorkspaceId(userId);
		const [row, role, reportingCurrency] = await Promise.all([
			this.db.acquisitionProfile.findUnique({
				where: { id: workspaceId },
			}),
			this.roleOf(userId, workspaceId),
			readReportingCurrency(this.db),
		]);

		return {
			mode: row?.mode ?? WorkspaceMode.SALES,
			preferredIndustries: row?.preferredIndustries ?? [],
			geographies: row?.geographies ?? [],
			excludedCategories: row?.excludedCategories ?? [],
			currency: row?.currency ?? reportingCurrency,
			revenueMinCents: toCents(row?.revenueMin ?? null),
			revenueMaxCents: toCents(row?.revenueMax ?? null),
			ebitdaMinCents: toCents(row?.ebitdaMin ?? null),
			ebitdaMaxCents: toCents(row?.ebitdaMax ?? null),
			purchasePriceMinCents: toCents(row?.purchasePriceMin ?? null),
			purchasePriceMaxCents: toCents(row?.purchasePriceMax ?? null),
			ownerInvolvement: row?.ownerInvolvement ?? null,
			recurringRevenuePreference: row?.recurringRevenuePreference ?? null,
			customerConcentrationMax: row?.customerConcentrationMax ?? null,
			assetPreference: row?.assetPreference ?? null,
			financingAssumptions: row?.financingAssumptions ?? null,
			updatedAt: row?.updatedAt.toISOString() ?? null,
			canManage: canRenameWorkspace(role),
		};
	}

	async setMode(
		userId: string,
		input: SetWorkspaceModeInput,
	): Promise<Workspace & { discoveryQueued: boolean }> {
		const workspaceId = await this.requireWorkspaceId(userId);
		await this.assertCanManageAcquisition(userId, workspaceId);

		const currency = await readReportingCurrency(this.db);

		const profile = await this.db.acquisitionProfile.upsert({
			where: { id: workspaceId },
			create: {
				id: workspaceId,
				mode: input.mode,
				preferredIndustries: [],
				geographies: [],
				excludedCategories: [],
				currency,
			},
			update: { mode: input.mode },
			select: { preferredIndustries: true, geographies: true },
		});

		const discoveryQueued =
			input.mode === WorkspaceMode.ACQUISITION && hasDiscoveryFocus(profile);
		if (discoveryQueued) {
			await this.agent.acquisitionProfileChanged(
				"Acquisition mode was enabled with a focused buy box; find a small first set of candidates",
			);
		}

		this.logger.log({
			message: "Workspace mode changed",
			userId,
			mode: input.mode,
		});

		return { ...(await this.get(userId)), discoveryQueued };
	}

	async updateAcquisitionProfile(
		userId: string,
		input: UpdateAcquisitionProfileInput,
	): Promise<AcquisitionProfile & { discoveryQueued: boolean }> {
		const workspaceId = await this.requireWorkspaceId(userId);
		await this.assertCanManageAcquisition(userId, workspaceId);

		const fields = {
			preferredIndustries: normalizeList(input.preferredIndustries),
			geographies: normalizeList(input.geographies),
			excludedCategories: normalizeList(input.excludedCategories),
			currency: input.currency,
			revenueMin: decimalFromCents(input.revenueMinCents),
			revenueMax: decimalFromCents(input.revenueMaxCents),
			ebitdaMin: decimalFromCents(input.ebitdaMinCents),
			ebitdaMax: decimalFromCents(input.ebitdaMaxCents),
			purchasePriceMin: decimalFromCents(input.purchasePriceMinCents),
			purchasePriceMax: decimalFromCents(input.purchasePriceMaxCents),
			ownerInvolvement: input.ownerInvolvement,
			recurringRevenuePreference: input.recurringRevenuePreference,
			customerConcentrationMax: input.customerConcentrationMax,
			assetPreference: input.assetPreference,
			financingAssumptions: blankToNull(input.financingAssumptions ?? ""),
		};
		const changed = await withAcquisitionProfileLock(
			this.db,
			workspaceId,
			async (tx) => {
				const current = await tx.acquisitionProfile.findUnique({
					where: { id: workspaceId },
					select: {
						preferredIndustries: true,
						geographies: true,
						excludedCategories: true,
						currency: true,
						revenueMin: true,
						revenueMax: true,
						ebitdaMin: true,
						ebitdaMax: true,
						purchasePriceMin: true,
						purchasePriceMax: true,
						ownerInvolvement: true,
						recurringRevenuePreference: true,
						customerConcentrationMax: true,
						assetPreference: true,
						financingAssumptions: true,
					},
				});
				const profileChanged = acquisitionProfileChanged(current, fields);

				if (!current) {
					await tx.acquisitionProfile.create({
						data: {
							id: workspaceId,
							mode: WorkspaceMode.ACQUISITION,
							buyBoxRevision: 0,
							...fields,
						},
					});
				} else if (profileChanged) {
					await tx.acquisitionProfile.update({
						where: { id: workspaceId },
						data: { ...fields, buyBoxRevision: { increment: 1 } },
					});
				}

				return profileChanged;
			},
		);

		const discoveryQueued = changed && hasDiscoveryFocus(fields);
		if (discoveryQueued) {
			await this.agent.acquisitionProfileChanged(
				"The buy box changed; refresh the discovery strategy",
			);
		}

		if (changed && isDossierReady(fields)) {
			await this.queueTargetRefreshes(
				workspaceId,
				"Buy box changed — acquisition research refresh queued",
			);
		}

		this.logger.log({ message: "Acquisition profile updated", userId });

		return { ...(await this.acquisitionProfile(userId)), discoveryQueued };
	}

	async update(
		userId: string,
		input: UpdateWorkspaceInput,
	): Promise<Workspace> {
		const workspaceId = await this.requireWorkspaceId(userId);
		const role = await this.roleOf(userId, workspaceId);

		if (!canRenameWorkspace(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change the workspace.",
			);
		}

		const before = await this.db.organization.findUnique({
			where: { id: workspaceId },
			select: { website: true, metadata: true },
		});

		const website = normalizeDomain(input.website);

		if (input.website !== null && !website) {
			throw new BadRequestException(
				"That is not a website. Enter the domain, like acme.com.",
			);
		}

		await this.db.$transaction([
			this.db.organization.update({
				where: { id: workspaceId },
				data: {
					name: input.name,
					slug: workspaceSlug(input.name),
					website,
					metadata: markOnboarded(before?.metadata ?? null, new Date()),
				},
			}),
			this.db.acquisitionProfile.upsert({
				where: { id: workspaceId },
				create: {
					id: workspaceId,
					mode: WorkspaceMode.ACQUISITION,
					preferredIndustries: [],
					geographies: [],
					excludedCategories: [],
				},
				update: {},
			}),
		]);

		this.logger.log({ message: "Workspace updated", userId });

		if (website && website !== before?.website) {
			await this.agent.workspaceChanged(
				website,
				before?.website
					? "The company using this CRM changed its website"
					: "The company using this CRM said what its website is",
			);
		}
		return this.get(userId);
	}

	async members(
		userId: string,
		input: MemberListInput,
	): Promise<ListResult<WorkspaceMember>> {
		const workspaceId = await this.requireWorkspaceId(userId);
		const where = this.buildWhere(input, workspaceId);
		const { skip, take } = paginate(input);

		const [rows, total, roles] = await Promise.all([
			this.db.member.findMany({
				where,
				skip,
				take,
				select: MEMBER_SELECT,
				orderBy: resolveOrderBy(input, SORTABLE, { createdAt: "asc" }),
			}),
			this.db.member.count({ where }),
			this.db.member.groupBy({
				by: ["role"],
				where: this.searchWhere(input.q, workspaceId),
				_count: { _all: true },
			}),
		]);

		return {
			rows: rows.map((row) => this.toMember(row, userId)),
			total,
			facetCounts: { role: countsByKey(roles, "role") },
		};
	}

	async setMemberRole(
		userId: string,
		input: SetMemberRoleInput,
	): Promise<WorkspaceMember> {
		const workspaceId = await this.requireWorkspaceId(userId);
		const role = await this.roleOf(userId, workspaceId);

		if (!canChangeRole(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change a member's role.",
			);
		}

		const updated = await this.db.$transaction(async (tx) => {
			const target = await tx.member.findFirst({
				where: { id: input.memberId, organizationId: workspaceId },
				select: { id: true, role: true },
			});

			if (!target) {
				throw new NotFoundException("That person is not in this workspace.");
			}

			if (target.role === "owner" && input.role !== "owner") {
				const owners = await tx.$queryRaw<{ id: string }[]>`
					SELECT id FROM "member"
					WHERE "organizationId" = ${workspaceId} AND role = 'owner'
					FOR UPDATE
				`;

				if (owners.length <= 1) {
					throw new ForbiddenException(
						"The workspace needs an owner. Make someone else an owner first.",
					);
				}
			}

			return tx.member.update({
				where: { id: target.id },
				data: { role: input.role },
				select: MEMBER_SELECT,
			});
		});

		this.logger.log({
			message: "Workspace role changed",
			userId,
			memberId: updated.id,
			role: input.role,
		});

		return this.toMember(updated, userId);
	}

	private toMember(row: MemberRow, userId: string): WorkspaceMember {
		return {
			id: row.id,
			userId: row.userId,
			name: row.user.name,
			email: row.user.email,
			image: row.user.image,
			role: toRole(row.role),
			joinedAt: row.createdAt.toISOString(),
			isViewer: row.userId === userId,
		};
	}

	private searchWhere(
		q: string,
		organizationId: string,
	): Prisma.MemberWhereInput {
		const term = q.trim();
		const where: Prisma.MemberWhereInput = { organizationId };

		if (term) {
			where.user = {
				OR: [
					{ name: { contains: term, mode: "insensitive" } },
					{ email: { contains: term, mode: "insensitive" } },
				],
			};
		}

		return where;
	}

	private buildWhere(
		input: MemberListInput,
		organizationId: string,
	): Prisma.MemberWhereInput {
		const where = this.searchWhere(input.q, organizationId);

		if (input.role !== FACET_ALL) {
			where.role = input.role;
		}

		return where;
	}

	private async requireWorkspaceId(userId: string): Promise<string> {
		const workspaceId =
			getOrganizationId() ?? (await organizationIdForUser(userId));
		if (!workspaceId) {
			throw new ServiceUnavailableException(
				"The workspace could not be created. Sign in again in a moment.",
			);
		}
		return workspaceId;
	}

	private async readWorkspace(organizationId: string) {
		return this.db.organization.findUnique({
			where: { id: organizationId },
			select: {
				id: true,
				slug: true,
				name: true,
				website: true,
				metadata: true,
			},
		});
	}

	private async roleOf(
		userId: string,
		organizationId: string,
	): Promise<WorkspaceRole | null> {
		const member = await this.db.member.findUnique({
			where: {
				organizationId_userId: { organizationId, userId },
			},
			select: { role: true },
		});

		return member ? toRole(member.role) : null;
	}

	private async assertCanManageAcquisition(
		userId: string,
		organizationId: string,
	): Promise<void> {
		const role = await this.roleOf(userId, organizationId);

		if (!canRenameWorkspace(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change the acquisition workflow.",
			);
		}
	}

	private async queueTargetRefreshes(
		organizationId: string,
		reason: string,
	): Promise<void> {
		const companyIds = await acquisitionRefreshTargetIds(
			this.db,
			organizationId,
			50,
		);

		await Promise.all(
			companyIds.map((companyId) =>
				this.agent
					.acquisitionTargetRequested(companyId, reason)
					.catch(() => null),
			),
		);
	}
}

function normalizeList(values: string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		const key = trimmed.toLowerCase();
		if (!trimmed || seen.has(key)) continue;
		seen.add(key);
		normalized.push(trimmed);
	}

	return normalized;
}
