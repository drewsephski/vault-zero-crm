import {
	type AcquisitionFit,
	type AcquisitionStage,
	type Db,
	type EnrichmentStatus,
	type Prisma,
	Prisma as PrismaNamespace,
	RecordSource,
	WorkspaceMode,
} from "@crm/db";
import {
	ACQUISITION_CRITERION_IDS,
	ACQUISITION_CRITERION_RESULTS,
	type AcquisitionCriterionAssessment,
	isAcquisitionEvidenceUrl,
} from "@crm/db/acquisition";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { companyTargetWhere } from "../acquisition/acquisition-where";
import { AgentQueueService } from "../agent/agent-queue.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import {
	ActivityStampService,
	type StampTargets,
} from "../crm/activity-stamp.service";
import { blankToNull, toCents } from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import { OPEN_DEAL_STAGES } from "../deals/deal-stage";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	ownerFilter,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import { hasDiscoveryFocus } from "../workspace/workspace.service";
import type {
	CompanyBulkUpdateInput,
	CompanyCreateInput,
	CompanyListInput,
	CompanyUpdateInput,
} from "./companies.contracts";
import { normalizeDomain } from "./domain";
import { FaviconService } from "./favicon.service";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

export type CompanyRow = {
	id: string;
	name: string;
	domain: string | null;
	iconUrl: string | null;
	iconDarkUrl: string | null;
	iconTone: string | null;
	logoUrl: string | null;
	brandColor: string | null;
	industry: string | null;
	enrichmentStatus: EnrichmentStatus;
	queued: boolean;
	source: RecordSource;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	contactCount: number;
	openDealCount: number;
	lastActivityAt: string | null;
	createdAt: string;
	acquisitionTarget: {
		stage: AcquisitionStage;
		fit: AcquisitionFit;
		researchedAt: string | null;
		recommendedAction: string | null;
	} | null;
};

type DossierEvidence = { label: string; url: string };
type DossierFinding = { summary: string; evidence: DossierEvidence[] };

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.CompanyOrderByWithRelationInput
> = {
	name: (dir) => ({ name: dir }),
	domain: (dir) => ({ domain: dir }),
	industry: (dir) => ({ industry: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	contacts: (dir) => ({ contacts: { _count: dir } }),
	deals: (dir) => ({ deals: { _count: dir } }),
	owner: (dir) => ({ owner: { name: dir } }),
	lastActivity: (dir) => ({ lastActivityAt: { sort: dir, nulls: "last" } }),
};

@Injectable()
export class CompaniesService {
	private readonly logger = new Logger(CompaniesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly queue: AgentQueueService,
		private readonly favicon: FaviconService,
		private readonly stamp: ActivityStampService,
		private readonly conversion: ConversionService,
	) {}

	async list(input: CompanyListInput): Promise<ListResult<CompanyRow>> {
		const acquisitionProfile = await this.db.acquisitionProfile.findUnique({
			where: { id: WORKSPACE_ID },
			select: { mode: true },
		});
		const acquisitionMode =
			acquisitionProfile?.mode === WorkspaceMode.ACQUISITION;
		const baseWhere = this.buildWhere(input);
		const where = acquisitionMode
			? companyTargetWhere(input.targetView, baseWhere)
			: baseWhere;
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts] = await Promise.all([
			this.db.company.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, {
					createdAt: "desc",
				}),
				select: {
					id: true,
					name: true,
					domain: true,
					iconUrl: true,
					iconDarkUrl: true,
					iconTone: true,
					logoUrl: true,
					brandColor: true,
					industry: true,
					enrichmentStatus: true,
					source: true,
					owner: { select: OWNER_SELECT },
					_count: {
						select: {
							contacts: true,
							deals: { where: { stage: { in: [...OPEN_DEAL_STAGES] } } },
						},
					},
					lastActivityAt: true,
					createdAt: true,
					acquisitionTarget: {
						select: {
							stage: true,
							fit: true,
							researchedAt: true,
							recommendedAction: true,
						},
					},
				},
			}),
			this.db.company.count({ where }),
			this.facetCounts(input, acquisitionMode),
		]);

		const queued = await this.queue.queuedCompanies(rows.map((row) => row.id));

		return {
			rows: rows.map((row) => ({
				id: row.id,
				name: row.name,
				domain: row.domain,
				iconUrl: row.iconUrl,
				iconDarkUrl: row.iconDarkUrl,
				iconTone: row.iconTone,
				logoUrl: row.logoUrl,
				brandColor: row.brandColor,
				industry: row.industry,
				enrichmentStatus: row.enrichmentStatus,
				queued: queued.has(row.id),
				source: row.source,
				owner: row.owner,
				contactCount: row._count.contacts,
				openDealCount: row._count.deals,
				lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
				createdAt: row.createdAt.toISOString(),
				acquisitionTarget: row.acquisitionTarget
					? {
							...row.acquisitionTarget,
							researchedAt:
								row.acquisitionTarget.researchedAt?.toISOString() ?? null,
						}
					: null,
			})),
			total,
			facetCounts,
		};
	}

	async byId(id: string) {
		const company = await this.db.company.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				description: true,
				logoUrl: true,
				logoDarkUrl: true,
				iconUrl: true,
				iconDarkUrl: true,
				iconTone: true,
				brandColor: true,
				industry: true,
				subIndustry: true,
				city: true,
				stateCode: true,
				country: true,
				countryCode: true,
				phone: true,
				email: true,
				linkedinUrl: true,
				twitterUrl: true,
				githubUrl: true,
				pricingUrl: true,
				careersUrl: true,
				enrichmentStatus: true,
				enrichedAt: true,
				enrichmentError: true,
				source: true,
				createdAt: true,
				acquisitionTarget: true,
				owner: { select: OWNER_SELECT },
				primaryContact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						title: true,
					},
				},
				contacts: {
					orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						title: true,
						imageUrl: true,
						owner: { select: OWNER_SELECT },
					},
				},
				deals: {
					orderBy: [{ stage: "asc" }, { expectedCloseDate: "asc" }],
					select: {
						id: true,
						name: true,
						stage: true,
						amount: true,
						currency: true,
						baseAmount: true,
						expectedCloseDate: true,
						owner: { select: OWNER_SELECT },
					},
				},
			},
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		const {
			deals,
			primaryContact,
			enrichedAt,
			createdAt,
			acquisitionTarget,
			...rest
		} = company;

		const [queuedKinds, acquisitionResearch, reportingCurrency] =
			await Promise.all([
				this.queue.pendingKinds({ companyId: id }),
				this.queue.acquisitionResearchState(id),
				this.conversion.reportingCurrency(),
			]);

		return {
			...rest,
			queued: queuedKinds.length > 0,
			queuedKinds,
			acquisitionResearch,
			createdAt: createdAt.toISOString(),
			enrichedAt: enrichedAt?.toISOString() ?? null,
			acquisitionTarget: acquisitionTarget
				? {
						...acquisitionTarget,
						strengths: parseDossierFindings(acquisitionTarget.strengths),
						concerns: parseDossierFindings(acquisitionTarget.concerns),
						criteria: parseDossierCriteria(acquisitionTarget.criteria),
						researchedAt: acquisitionTarget.researchedAt?.toISOString() ?? null,
						createdAt: acquisitionTarget.createdAt.toISOString(),
						updatedAt: acquisitionTarget.updatedAt.toISOString(),
					}
				: null,
			primaryContactId: primaryContact?.id ?? null,
			primaryContact,
			reportingCurrency,
			deals: deals.map((deal) => ({
				...deal,
				amount: undefined,
				baseAmount: undefined,
				amountCents: toCents(deal.amount),
				baseAmountCents: toCents(deal.baseAmount),
				expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			})),
		};
	}

	async options(q: string) {
		return this.db.company.findMany({
			where: this.searchFilter(q),
			select: { id: true, name: true, domain: true, iconUrl: true },
			orderBy: { name: "asc" },
			take: 100,
		});
	}

	async create(
		input: CompanyCreateInput,
		source: RecordSource = RecordSource.MANUAL,
		acquisitionTarget?: Prisma.AcquisitionTargetCreateWithoutCompanyInput,
	) {
		const domain = normalizeDomain(input.domain);

		if (domain) {
			const existing = await this.db.company.findUnique({
				where: { domain },
				select: { id: true, name: true },
			});
			if (existing) {
				throw new ConflictException(
					`${existing.name} already uses the domain ${domain}.`,
				);
			}
		}

		let company: { id: string; name: string; domain: string | null };
		try {
			company = await this.db.company.create({
				data: {
					name: input.name.trim(),
					domain,
					website: domain ? `https://${domain}` : null,
					ownerId: input.ownerId ?? null,
					source,
					acquisitionTarget: acquisitionTarget
						? { create: acquisitionTarget }
						: undefined,
				},
				select: { id: true, name: true, domain: true },
			});
		} catch (error) {
			throw this.translate(error, "new company");
		}

		this.logger.log({
			message: "Company created",
			companyId: company.id,
			domain: company.domain,
		});

		await this.agent.companyCreated(company.id);

		void this.favicon.backfill(company.id, company.domain);

		return company;
	}

	async update(id: string, input: CompanyUpdateInput) {
		const data: Prisma.CompanyUpdateInput = {};

		if (input.name !== undefined) data.name = input.name.trim();
		if (input.website !== undefined) data.website = blankToNull(input.website);
		if (input.description !== undefined) {
			data.description = blankToNull(input.description);
		}
		if (input.industry !== undefined)
			data.industry = blankToNull(input.industry);
		if (input.city !== undefined) data.city = blankToNull(input.city);
		if (input.stateCode !== undefined) {
			data.stateCode = blankToNull(input.stateCode);
		}
		if (input.country !== undefined) data.country = blankToNull(input.country);
		if (input.phone !== undefined) data.phone = blankToNull(input.phone);
		if (input.email !== undefined) data.email = blankToNull(input.email);
		if (input.linkedinUrl !== undefined) {
			data.linkedinUrl = blankToNull(input.linkedinUrl);
		}
		if (input.ownerId !== undefined) {
			data.owner = input.ownerId
				? { connect: { id: input.ownerId } }
				: { disconnect: true };
		}

		if (input.domain !== undefined) {
			const domain = normalizeDomain(input.domain);
			if (input.domain.trim() && !domain) {
				throw new BadRequestException(
					`"${input.domain}" is not a domain — try something like "stripe.com".`,
				);
			}
			data.domain = domain;
			const current = await this.db.company.findUnique({
				where: { id },
				select: { domain: true },
			});
			if (current && current.domain !== domain) {
				data.enrichmentStatus = "PENDING";
				data.enrichmentError = null;
				data.iconUrl = null;
				data.iconDarkUrl = null;
				data.iconTone = null;
			}
		}

		try {
			const updated = await this.db.company.update({
				where: { id },
				data,
				select: { id: true, name: true, domain: true },
			});

			if (data.enrichmentStatus === "PENDING") {
				await this.agent.companyCreated(
					id,
					"Domain changed — anything we knew was about a different company",
				);
				void this.favicon.backfill(id, updated.domain);
			}

			return updated;
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async delete(id: string): Promise<{ id: string; name: string }> {
		let deleted: { targets: StampTargets; name: string };

		try {
			deleted = await this.db.$transaction(async (tx) => {
				const targets = await this.stamp.targetsOf(
					{ OR: [{ companyId: id }, { deal: { companyId: id } }] },
					tx,
				);

				await tx.agentTask.deleteMany({ where: { companyId: id } });

				const company = await tx.company.delete({
					where: { id },
					select: { name: true },
				});

				return { targets, name: company.name };
			});
		} catch (error) {
			throw this.translate(error, id);
		}

		await this.stamp.recomputeAfterDelete(deleted.targets, { companyId: id });

		this.logger.log({
			message: "Company deleted",
			companyId: id,
			name: deleted.name,
		});

		return { id, name: deleted.name };
	}

	async bulkDelete(ids: string[]): Promise<{ ids: string[]; count: number }> {
		const uniqueIds = [...new Set(ids)];
		let deleted: { targets: StampTargets; count: number };

		try {
			deleted = await this.db.$transaction(async (tx) => {
				const existing = await tx.company.count({
					where: { id: { in: uniqueIds } },
				});
				if (existing !== uniqueIds.length) {
					throw new NotFoundException("One or more companies no longer exist.");
				}

				const targets = await this.stamp.targetsOf(
					{
						OR: [
							{ companyId: { in: uniqueIds } },
							{ deal: { companyId: { in: uniqueIds } } },
						],
					},
					tx,
				);

				await tx.agentTask.deleteMany({
					where: { companyId: { in: uniqueIds } },
				});
				const result = await tx.company.deleteMany({
					where: { id: { in: uniqueIds } },
				});

				return { targets, count: result.count };
			});
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			throw this.translate(error, uniqueIds[0] ?? "bulk");
		}

		await this.stamp.recomputeAfterBulkDelete(deleted.targets, {
			companyIds: uniqueIds,
		});

		this.logger.log({ message: "Companies deleted", count: deleted.count });
		return { ids: uniqueIds, count: deleted.count };
	}

	async bulkUpdate(
		ids: string[],
		input: CompanyBulkUpdateInput,
	): Promise<{ ids: string[]; count: number }> {
		const uniqueIds = [...new Set(ids)];
		let result: { count: number };
		try {
			result = await this.db.$transaction(async (tx) => {
				const existing = await tx.company.count({
					where: { id: { in: uniqueIds } },
				});
				if (existing !== uniqueIds.length) {
					throw new NotFoundException("One or more companies no longer exist.");
				}
				return tx.company.updateMany({
					where: { id: { in: uniqueIds } },
					data: { ownerId: input.ownerId },
				});
			});
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			throw this.translate(error, uniqueIds[0] ?? "bulk");
		}

		this.logger.log({ message: "Companies updated", count: result.count });
		return { ids: uniqueIds, count: result.count };
	}

	async enrich(id: string): Promise<{ id: string; queued: boolean }> {
		const company = await this.db.company.findUnique({
			where: { id },
			select: { id: true },
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		await this.db.company.update({
			where: { id },
			data: { enrichmentStatus: "PENDING", enrichmentError: null },
		});
		await this.agent.companyDetailsRequested(
			id,
			"A rep asked to refresh the company details",
		);

		return { id, queued: true };
	}

	async research(id: string, actingUserId: string) {
		const [company, profile] = await Promise.all([
			this.db.company.findUnique({
				where: { id },
				select: {
					id: true,
					domain: true,
					acquisitionTarget: { select: { companyId: true } },
				},
			}),
			this.db.acquisitionProfile.findUnique({
				where: { id: WORKSPACE_ID },
				select: {
					mode: true,
					preferredIndustries: true,
					geographies: true,
				},
			}),
		]);

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		if (profile?.mode === WorkspaceMode.ACQUISITION) {
			if (!company.acquisitionTarget) {
				throw new BadRequestException(
					"Add this company to targets before analyzing fit.",
				);
			}
			if (!hasDiscoveryFocus(profile)) {
				throw new BadRequestException(
					"Add at least one preferred industry or geography to the buy box before analyzing fit.",
				);
			}
			return this.analyzeAcquisition(id, actingUserId);
		}

		if (!company.domain) {
			throw new BadRequestException(
				"There is nothing to read without a domain — add one first.",
			);
		}

		await this.agent.companyResearchRequested(
			id,
			`Company briefing requested by a rep (${actingUserId})`,
		);

		return {
			ok: true as const,
			queued: true as const,
			kind: "brief" as const,
		};
	}

	async analyzeAcquisition(id: string, actingUserId: string) {
		const company = await this.db.company.findUnique({
			where: { id },
			select: {
				id: true,
				domain: true,
				acquisitionTarget: { select: { companyId: true } },
			},
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}
		if (!company.acquisitionTarget) {
			throw new BadRequestException(
				"Add this company to targets before analyzing fit.",
			);
		}
		if (!company.domain) {
			throw new BadRequestException(
				"There is nothing to analyze without a domain — add one first.",
			);
		}

		await this.agent.acquisitionTargetRequested(
			id,
			`Acquisition analysis requested by a rep (${actingUserId})`,
		);

		return {
			ok: true as const,
			queued: true as const,
			kind: "acquisition" as const,
		};
	}

	async setPrimaryContact(companyId: string, contactId: string | null) {
		if (contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: contactId },
				select: { companyId: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${contactId}.`);
			}
			if (contact.companyId !== companyId) {
				throw new BadRequestException(
					"That contact does not work at this company.",
				);
			}
		}

		try {
			return await this.db.company.update({
				where: { id: companyId },
				data: { primaryContactId: contactId },
				select: { id: true, primaryContactId: true },
			});
		} catch (error) {
			throw this.translate(error, companyId);
		}
	}

	private searchFilter(q: string): Prisma.CompanyWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			OR: [
				{ name: { contains: term, mode: "insensitive" } },
				{ domain: { contains: term, mode: "insensitive" } },
			],
		};
	}

	private buildWhere(input: CompanyListInput): Prisma.CompanyWhereInput {
		const where: Prisma.CompanyWhereInput = {
			...this.searchFilter(input.q),
			...ownerFilter(input.owner),
		};

		if (input.industry !== FACET_ALL) {
			where.industry = input.industry;
		}

		if (input.enrichment !== FACET_ALL) {
			where.enrichmentStatus = input.enrichment as EnrichmentStatus;
		}

		if (input.source !== FACET_ALL) {
			where.source = input.source as RecordSource;
		}

		return where;
	}

	private async facetCounts(input: CompanyListInput, acquisitionMode: boolean) {
		const searchWhere = this.searchFilter(input.q);
		const where = acquisitionMode
			? companyTargetWhere(input.targetView, searchWhere)
			: searchWhere;

		const [owners, industries, enrichment, sources] = await Promise.all([
			this.db.company.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["industry"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["enrichmentStatus"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["source"],
				where,
				_count: { _all: true },
			}),
		]);

		return {
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			industry: countsByKey(industries, "industry"),
			enrichment: countsByKey(enrichment, "enrichmentStatus"),
			source: countsByKey(sources, "source"),
		};
	}

	private translate(error: unknown, id: string): unknown {
		if (error instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (error.code === "P2025") {
				return new NotFoundException(`No company with id ${id}.`);
			}
			if (error.code === "P2002") {
				return new ConflictException(
					"Another company already uses that domain.",
				);
			}
		}
		return error;
	}
}

function parseDossierFindings(value: Prisma.JsonValue): DossierFinding[] {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return [];
		const summary = item.summary;
		if (typeof summary !== "string" || !summary.trim()) return [];
		const evidence = Array.isArray(item.evidence)
			? item.evidence.flatMap((source) => {
					if (!source || typeof source !== "object" || Array.isArray(source)) {
						return [];
					}
					return typeof source.label === "string" &&
						typeof source.url === "string" &&
						isAcquisitionEvidenceUrl(source.url)
						? [{ label: source.label, url: source.url }]
						: [];
				})
			: [];
		return [{ summary, evidence }];
	});
}

function parseDossierCriteria(
	value: Prisma.JsonValue,
): AcquisitionCriterionAssessment[] {
	if (!Array.isArray(value)) return [];

	const criteria: AcquisitionCriterionAssessment[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object" || Array.isArray(item)) return [];
		if (
			typeof item.id !== "string" ||
			!ACQUISITION_CRITERION_IDS.includes(
				item.id as AcquisitionCriterionAssessment["id"],
			) ||
			typeof item.result !== "string" ||
			!ACQUISITION_CRITERION_RESULTS.includes(
				item.result as AcquisitionCriterionAssessment["result"],
			) ||
			typeof item.explanation !== "string" ||
			!item.explanation.trim() ||
			typeof item.blocksQualification !== "boolean" ||
			!Array.isArray(item.evidence)
		) {
			return [];
		}

		const evidence: DossierEvidence[] = [];
		for (const source of item.evidence) {
			if (
				!source ||
				typeof source !== "object" ||
				Array.isArray(source) ||
				typeof source.label !== "string" ||
				!source.label.trim() ||
				typeof source.url !== "string" ||
				!isAcquisitionEvidenceUrl(source.url)
			) {
				return [];
			}
			evidence.push({ label: source.label, url: source.url });
		}
		if (item.result !== "UNKNOWN" && evidence.length === 0) return [];
		if (item.blocksQualification && item.result !== "UNKNOWN") return [];

		criteria.push({
			id: item.id as AcquisitionCriterionAssessment["id"],
			result: item.result as AcquisitionCriterionAssessment["result"],
			explanation: item.explanation,
			blocksQualification: item.blocksQualification,
			evidence,
		});
	}

	return criteria;
}
