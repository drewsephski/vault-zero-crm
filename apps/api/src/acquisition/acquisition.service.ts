import {
	AcquisitionCandidateStatus,
	AcquisitionEngagementStage,
	AcquisitionEngagementStatus,
	AcquisitionFit,
	AcquisitionStage,
	ActivityType,
	type Db,
	Prisma,
	type Prisma as PrismaNamespace,
	RecordSource,
} from "@crm/db";
import { isDossierReady, isTargetLifecycleStage } from "@crm/db/acquisition";
import {
	parseAcquisitionDossierSnapshot,
	researchRunListSnapshot,
} from "@crm/db/acquisition-research-runs";
import { getOrganizationId } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import type { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { CompaniesService } from "../companies/companies.service";
import { normalizeDomain } from "../companies/domain";
import { toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	ownerFilter,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	CreateAcquisitionEngagementInput,
	EngagementTargetOptionsInput,
	ListAcquisitionEngagementsInput,
	UpdateAcquisitionEngagementStageInput,
} from "./acquisition-engagements.contracts";
import {
	ENGAGEMENT_STATUS_FILTERS,
	engagementTargetOptionsInput,
	listAcquisitionEngagementsInput,
} from "./acquisition-engagements.contracts";

type ParsedListAcquisitionEngagementsInput = z.infer<
	typeof listAcquisitionEngagementsInput
>;

import type {
	CreateAcquisitionTargetInput,
	TargetMutationResult,
	TargetResearchResult,
} from "./acquisition.contracts";
import {
	listResearchRunsInput,
	researchRunIdInput,
} from "./acquisition-research-runs.contracts";

const ACTIVE_ENGAGEMENT_CONFLICT =
	"This target already has an active acquisition opportunity.";
const IDEMPOTENCY_CONTEXT_CONFLICT =
	"This request id has already been used for another opportunity.";
const TERMINAL_ENGAGEMENT_CONFLICT =
	"This acquisition opportunity is closed and cannot be moved to another stage.";
const TARGET_REQUIRED_CONFLICT =
	"Add this company to Targets before opening an acquisition opportunity.";

const TERMINAL_ENGAGEMENT_STAGES = new Set<AcquisitionEngagementStage>([
	AcquisitionEngagementStage.ACQUIRED,
	AcquisitionEngagementStage.PASSED,
]);

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const COMPANY_SELECT = {
	id: true,
	name: true,
	domain: true,
	iconUrl: true,
	iconDarkUrl: true,
	iconTone: true,
	logoUrl: true,
} as const;

const ENGAGEMENT_SORTABLE: Record<
	string,
	(
		dir: Prisma.SortOrder,
	) => Prisma.AcquisitionEngagementOrderByWithRelationInput[]
> = {
	company: (dir) => [{ company: { name: dir } }, { stageChangedAt: "desc" }],
	stage: (dir) => [{ stage: dir }, { stageChangedAt: "desc" }],
	stageChangedAt: (dir) => [{ stageChangedAt: dir }],
	amount: (dir) => [{ baseAmount: { sort: dir, nulls: "last" } }],
	expectedCloseDate: (dir) => [{ expectedCloseDate: dir }],
	createdAt: (dir) => [{ createdAt: dir }],
	owner: (dir) => [{ owner: { name: dir } }, { company: { name: "asc" } }],
};

const ENGAGEMENT_SELECT = {
	id: true,
	companyId: true,
	ownerId: true,
	stage: true,
	status: true,
	stageChangedAt: true,
	amount: true,
	currency: true,
	expectedCloseDate: true,
	closedAt: true,
	closedReason: true,
	baseAmount: true,
	baseCurrency: true,
	fxRate: true,
	fxRateAt: true,
	createdAt: true,
	updatedAt: true,
	owner: { select: OWNER_SELECT },
	company: { select: COMPANY_SELECT },
} satisfies Prisma.AcquisitionEngagementSelect;

type EngagementRow = Prisma.AcquisitionEngagementGetPayload<{
	select: typeof ENGAGEMENT_SELECT;
}>;

function acquisitionTargetData(sourceUrls: string[]) {
	return {
		stage: AcquisitionStage.DISCOVERED,
		fit: AcquisitionFit.UNKNOWN,
		strengths: [],
		concerns: [],
		missingInformation: [],
		sourceUrls,
	};
}

@Injectable()
export class AcquisitionService {
	private readonly logger = new Logger(AcquisitionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompaniesService,
		private readonly agent: AgentTriggerService,
	) {}

	async createTarget(
		input: CreateAcquisitionTargetInput,
		actingUserId: string,
	): Promise<TargetMutationResult> {
		const { idempotencyKey, ...companyInput } = input;
		const prior = await this.db.acquisitionTargetCreateRequest.findUnique({
			where: { idempotencyKey },
			select: { companyId: true },
		});
		if (prior) return this.addTarget(prior.companyId, actingUserId);

		const domain = normalizeDomain(input.domain);
		let company: { id: string };
		try {
			company = await this.companies.create(
				companyInput,
				RecordSource.MANUAL,
				acquisitionTargetData([]),
				idempotencyKey,
			);
		} catch (error) {
			if (!(error instanceof ConflictException)) throw error;
			const winner = await this.findCreateTargetWinner(idempotencyKey, domain);
			if (!winner) throw error;
			return this.addTarget(winner.id, actingUserId);
		}

		return this.targetResult(company.id, actingUserId, true, true);
	}

	private async findCreateTargetWinner(
		idempotencyKey: string,
		domain: string | null,
	): Promise<{ id: string } | null> {
		const request = await this.db.acquisitionTargetCreateRequest.findUnique({
			where: { idempotencyKey },
			select: { companyId: true },
		});
		if (request) return { id: request.companyId };
		if (!domain) return null;

		return this.db.company.findFirst({
			where: { domain },
			select: { id: true },
		});
	}

	async addTarget(
		companyId: string,
		actingUserId: string,
	): Promise<TargetMutationResult> {
		const targetCreated = await this.ensureTarget(companyId, []);
		return this.targetResult(companyId, actingUserId, false, targetCreated);
	}

	async approveCandidate(id: string, actingUserId: string) {
		const candidate = await this.db.acquisitionCandidate.findUnique({
			where: { id },
		});

		if (!candidate) {
			throw new NotFoundException("That discovery candidate no longer exists.");
		}

		if (candidate.status === AcquisitionCandidateStatus.DISMISSED) {
			throw new BadRequestException(
				"This candidate was dismissed and cannot be approved.",
			);
		}
		if (candidate.companyId) {
			const result = await this.addTarget(candidate.companyId, actingUserId);
			return { candidateId: id, ...result };
		}

		let existing = await this.db.company.findFirst({
			where: { domain: candidate.domain },
			select: { id: true, source: true },
		});

		let created = false;
		let targetCreated = false;
		if (!existing) {
			try {
				const company = await this.companies.create(
					{ name: candidate.name, domain: candidate.domain },
					RecordSource.DISCOVERY,
					acquisitionTargetData([candidate.sourceUrl]),
				);
				existing = { id: company.id, source: RecordSource.DISCOVERY };
				created = true;
				targetCreated = true;
			} catch (error) {
				if (!(error instanceof ConflictException)) throw error;
				existing = await this.db.company.findFirst({
					where: { domain: candidate.domain },
					select: { id: true, source: true },
				});
				if (!existing) throw error;
			}
		}

		if (!targetCreated) {
			targetCreated = await this.ensureTarget(existing.id, [
				candidate.sourceUrl,
			]);
		}

		const status =
			existing.source === RecordSource.DISCOVERY
				? AcquisitionCandidateStatus.APPROVED
				: AcquisitionCandidateStatus.DUPLICATE;
		await this.db.acquisitionCandidate.updateMany({
			where: { id, companyId: null },
			data: { status, companyId: existing.id },
		});
		const linked = await this.db.acquisitionCandidate.findUnique({
			where: { id },
			select: { companyId: true },
		});
		if (!linked) {
			throw new NotFoundException("That discovery candidate no longer exists.");
		}
		if (linked.companyId !== existing.id) {
			throw new ConflictException(
				"That candidate was approved to a different company.",
			);
		}

		const result = await this.targetResult(
			existing.id,
			actingUserId,
			created,
			targetCreated,
		);

		this.logger.log({
			message: "Acquisition candidate approved",
			candidateId: id,
			companyId: existing.id,
			created,
		});

		return { candidateId: id, ...result };
	}

	private async ensureTarget(
		companyId: string,
		sourceUrls: string[],
	): Promise<boolean> {
		const company = await this.db.company.findUnique({
			where: { id: companyId },
			select: { id: true },
		});
		if (!company) throw new NotFoundException("That company no longer exists.");

		const result = await this.db.acquisitionTarget.createMany({
			data: [{ companyId, ...acquisitionTargetData(sourceUrls) }],
			skipDuplicates: true,
		});

		return result.count === 1;
	}

	private async targetResult(
		companyId: string,
		actingUserId: string,
		created: boolean,
		targetCreated: boolean,
	): Promise<TargetMutationResult> {
		const research = await this.queueResearch(companyId, actingUserId);
		const target = await this.db.acquisitionTarget.findUniqueOrThrow({
			where: { companyId },
			select: { stage: true },
		});

		return {
			companyId,
			created,
			targetCreated,
			stage: target.stage,
			research,
		};
	}

	private async queueResearch(
		companyId: string,
		actingUserId: string,
	): Promise<TargetResearchResult> {
		const readiness = await this.targetReadiness(companyId);
		if (readiness.blocker) {
			return { status: "blocked", blocker: readiness.blocker };
		}

		let queued: { taskId: string } | null;
		try {
			queued = await this.agent.acquisitionTargetRequested(
				companyId,
				`Acquisition analysis requested by a rep (${actingUserId})`,
			);
		} catch {
			queued = null;
		}
		if (!queued) return { status: "failed", blocker: "queue-unavailable" };

		return { status: "queued", taskId: queued.taskId };
	}

	private async targetReadiness(companyId: string): Promise<{
		blocker?: "missing-domain" | "missing-buy-box";
	}> {
		const [company, profile] = await Promise.all([
			this.db.company.findUnique({
				where: { id: companyId },
				select: { domain: true },
			}),
			this.db.acquisitionProfile.findUnique({
				where: { id: getOrganizationId() ?? WORKSPACE_ID },
				select: {
					preferredIndustries: true,
					geographies: true,
					excludedCategories: true,
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
			}),
		]);

		if (!company) throw new NotFoundException("That company no longer exists.");
		if (!normalizeDomain(company.domain)) return { blocker: "missing-domain" };
		if (!profile || !isDossierReady(profile)) {
			return { blocker: "missing-buy-box" };
		}
		return {};
	}

	async dismissCandidate(id: string) {
		const organizationId = getOrganizationId() ?? WORKSPACE_ID;
		const profile = await this.db.acquisitionProfile.findUnique({
			where: { id: organizationId },
			select: { buyBoxRevision: true },
		});
		const buyBoxRevision = profile?.buyBoxRevision ?? 0;

		const result = await this.db.acquisitionCandidate.updateMany({
			where: {
				id,
				organizationId,
				status: AcquisitionCandidateStatus.PROPOSED,
			},
			data: {
				status: AcquisitionCandidateStatus.DISMISSED,
				dismissedAt: new Date(),
				dismissedBuyBoxRevision: buyBoxRevision,
			},
		});

		if (result.count === 0) {
			const exists = await this.db.acquisitionCandidate.findUnique({
				where: { id },
				select: { status: true },
			});
			if (!exists) {
				throw new NotFoundException(
					"That discovery candidate no longer exists.",
				);
			}
			throw new BadRequestException(
				"Only proposed candidates can be dismissed.",
			);
		}

		this.logger.log({
			message: "Acquisition candidate dismissed",
			candidateId: id,
		});

		return { id, dismissed: true as const };
	}

	async updateTarget(
		companyId: string,
		stage: AcquisitionStage,
		actingUserId: string,
	) {
		const company = await this.db.company.findUnique({
			where: { id: companyId },
			select: {
				id: true,
				name: true,
				acquisitionTarget: { select: { stage: true } },
			},
		});
		if (!company) throw new NotFoundException("That target no longer exists.");
		if (!company.acquisitionTarget) {
			throw new NotFoundException("That target no longer exists.");
		}

		const target = await this.db.$transaction(async (tx) => {
			const { count } = await tx.acquisitionTarget.updateMany({
				where: { companyId },
				data: { stage },
			});
			if (count === 0) {
				throw new NotFoundException("That target no longer exists.");
			}
			if (company.acquisitionTarget?.stage !== stage) {
				await tx.activity.create({
					data: {
						type: ActivityType.STAGE_CHANGE,
						subject: `Moved ${company.name} to ${stage.toLowerCase()}`,
						companyId,
						createdById: actingUserId,
					},
				});
			}
			return tx.acquisitionTarget.findUniqueOrThrow({
				where: { companyId },
				select: { companyId: true, stage: true, updatedAt: true },
			});
		});

		this.logger.log({
			message: "Acquisition target stage changed",
			companyId,
			stage,
			actingUserId,
		});

		return { ...target, updatedAt: target.updatedAt.toISOString() };
	}

	async acceptRecommendedStage(
		companyId: string,
		actingUserId: string,
		idempotencyKey?: string,
	) {
		return this.db.$transaction(async (tx) => {
			if (idempotencyKey) {
				const prior = await tx.activity.findFirst({
					where: {
						companyId,
						type: ActivityType.STAGE_CHANGE,
						meta: { path: ["idempotencyKey"], equals: idempotencyKey },
					},
					select: { id: true },
				});
				if (prior) {
					const current = await tx.acquisitionTarget.findUniqueOrThrow({
						where: { companyId },
						select: {
							stage: true,
							recommendedStage: true,
							updatedAt: true,
						},
					});
					return {
						companyId,
						stage: current.stage,
						recommendedStage: current.recommendedStage,
						updatedAt: current.updatedAt.toISOString(),
					};
				}
			}

			const target = await tx.acquisitionTarget.findUnique({
				where: { companyId },
				select: {
					stage: true,
					recommendedStage: true,
					company: { select: { name: true } },
				},
			});
			if (!target) {
				throw new NotFoundException("That target no longer exists.");
			}

			const recommended = target.recommendedStage;
			if (!recommended) {
				throw new BadRequestException("No stage recommendation is pending.");
			}
			if (!isTargetLifecycleStage(recommended)) {
				throw new BadRequestException(
					"This stage recommendation is no longer supported. Dismiss it and set the lifecycle manually.",
				);
			}

			const previousStage = target.stage;
			if (previousStage === recommended) {
				await tx.acquisitionTarget.update({
					where: { companyId },
					data: { recommendedStage: null },
				});
			} else {
				await tx.acquisitionTarget.update({
					where: { companyId },
					data: { stage: recommended, recommendedStage: null },
				});
				await tx.activity.create({
					data: {
						type: ActivityType.STAGE_CHANGE,
						subject: `Moved ${target.company.name} to ${recommended.toLowerCase()}`,
						companyId,
						createdById: actingUserId,
						meta: {
							source: "eve-recommendation",
							previousStage,
							acceptedStage: recommended,
							...(idempotencyKey ? { idempotencyKey } : {}),
						},
					},
				});
			}

			const updated = await tx.acquisitionTarget.findUniqueOrThrow({
				where: { companyId },
				select: {
					stage: true,
					recommendedStage: true,
					updatedAt: true,
				},
			});

			return {
				companyId,
				stage: updated.stage,
				recommendedStage: updated.recommendedStage,
				updatedAt: updated.updatedAt.toISOString(),
			};
		});
	}

	async dismissRecommendedStage(companyId: string, actingUserId: string) {
		return this.db.$transaction(async (tx) => {
			const target = await tx.acquisitionTarget.findUnique({
				where: { companyId },
				select: { recommendedStage: true },
			});
			if (!target) {
				throw new NotFoundException("That target no longer exists.");
			}
			if (!target.recommendedStage) {
				throw new BadRequestException("No stage recommendation is pending.");
			}

			const dismissedStage = target.recommendedStage;
			await tx.acquisitionTarget.update({
				where: { companyId },
				data: { recommendedStage: null },
			});
			await tx.activity.create({
				data: {
					type: ActivityType.NOTE,
					subject: "Dismissed Eve stage recommendation",
					companyId,
					createdById: actingUserId,
					meta: {
						source: "eve-recommendation-dismissed",
						recommendedStage: dismissedStage,
						dismissedAt: new Date().toISOString(),
					},
				},
			});

			const updated = await tx.acquisitionTarget.findUniqueOrThrow({
				where: { companyId },
				select: {
					stage: true,
					recommendedStage: true,
					updatedAt: true,
				},
			});

			return {
				companyId,
				stage: updated.stage,
				recommendedStage: updated.recommendedStage,
				updatedAt: updated.updatedAt.toISOString(),
			};
		});
	}

	async acceptRecommendedAction(
		companyId: string,
		actingUserId: string,
		idempotencyKey?: string,
		dueAt?: string,
	) {
		return this.db.$transaction(async (tx) => {
			if (idempotencyKey) {
				const prior = await tx.activity.findFirst({
					where: {
						companyId,
						type: ActivityType.TASK,
						meta: { path: ["idempotencyKey"], equals: idempotencyKey },
					},
					select: { id: true },
				});
				if (prior) {
					const target = await tx.acquisitionTarget.findUniqueOrThrow({
						where: { companyId },
						select: { recommendedAction: true },
					});
					return {
						companyId,
						taskId: prior.id,
						recommendedAction: target.recommendedAction,
					};
				}
			}

			const target = await tx.acquisitionTarget.findUnique({
				where: { companyId },
				select: { recommendedAction: true },
			});
			if (!target) {
				throw new NotFoundException("That target no longer exists.");
			}
			if (!target.recommendedAction) {
				throw new BadRequestException("No action recommendation is pending.");
			}

			const actionText = target.recommendedAction;
			const task = await tx.activity.create({
				data: {
					type: ActivityType.TASK,
					subject: actionText,
					companyId,
					createdById: actingUserId,
					dueAt: dueAt ? new Date(dueAt) : null,
					meta: {
						source: "eve-recommendation",
						...(idempotencyKey ? { idempotencyKey } : {}),
					},
				},
				select: { id: true },
			});

			await tx.acquisitionTarget.update({
				where: { companyId },
				data: { recommendedAction: null },
			});

			return {
				companyId,
				taskId: task.id,
				recommendedAction: null,
			};
		});
	}

	async dismissRecommendedAction(companyId: string, actingUserId: string) {
		return this.db.$transaction(async (tx) => {
			const target = await tx.acquisitionTarget.findUnique({
				where: { companyId },
				select: { recommendedAction: true },
			});
			if (!target) {
				throw new NotFoundException("That target no longer exists.");
			}
			if (!target.recommendedAction) {
				throw new BadRequestException("No action recommendation is pending.");
			}

			const dismissedAction = target.recommendedAction;
			await tx.acquisitionTarget.update({
				where: { companyId },
				data: { recommendedAction: null },
			});
			await tx.activity.create({
				data: {
					type: ActivityType.NOTE,
					subject: "Dismissed Eve action recommendation",
					companyId,
					createdById: actingUserId,
					meta: {
						source: "eve-recommendation-dismissed",
						recommendedAction: dismissedAction,
						dismissedAt: new Date().toISOString(),
					},
				},
			});

			return { companyId, recommendedAction: null };
		});
	}

	async createEngagement(
		input: CreateAcquisitionEngagementInput,
		actingUserId: string,
	) {
		const organizationId = getOrganizationId() ?? WORKSPACE_ID;
		const prior = await this.db.acquisitionEngagementCreateRequest.findUnique({
			where: { idempotencyKey: input.idempotencyKey },
			select: { engagementId: true },
		});
		if (prior) {
			return this.loadIdempotentEngagement(
				prior.engagementId,
				organizationId,
				input.companyId,
			);
		}

		const company = await this.db.company.findUnique({
			where: { id: input.companyId },
			select: {
				id: true,
				name: true,
				ownerId: true,
				acquisitionTarget: { select: { companyId: true } },
			},
		});
		if (!company) {
			throw new NotFoundException("That company no longer exists.");
		}
		if (!company.acquisitionTarget) {
			throw new BadRequestException(TARGET_REQUIRED_CONFLICT);
		}

		const active = await this.db.acquisitionEngagement.findFirst({
			where: {
				companyId: input.companyId,
				status: AcquisitionEngagementStatus.ACTIVE,
			},
			select: { id: true },
		});
		if (active) {
			throw new ConflictException(ACTIVE_ENGAGEMENT_CONFLICT);
		}

		const ownerId = await this.resolveEngagementOwner(
			input.ownerId,
			company.ownerId,
			actingUserId,
			organizationId,
		);
		const stage = input.stage ?? AcquisitionEngagementStage.OUTREACH;

		try {
			const engagement = await this.db.$transaction(async (tx) => {
				const created = await tx.acquisitionEngagement.create({
					data: {
						organizationId,
						companyId: input.companyId,
						ownerId,
						stage,
						status: AcquisitionEngagementStatus.ACTIVE,
						createRequest: {
							create: { idempotencyKey: input.idempotencyKey },
						},
					},
					select: ENGAGEMENT_SELECT,
				});
				await tx.activity.create({
					data: {
						type: ActivityType.STAGE_CHANGE,
						subject: `Opened acquisition engagement for ${company.name}`,
						companyId: input.companyId,
						engagementId: created.id,
						createdById: actingUserId,
					},
				});
				return created;
			});

			return this.serializeEngagement(engagement);
		} catch (error) {
			return this.recoverCreateEngagement(error, input, organizationId);
		}
	}

	async listEngagements(raw: ListAcquisitionEngagementsInput) {
		const input = listAcquisitionEngagementsInput.parse(raw);
		const organizationId = getOrganizationId() ?? WORKSPACE_ID;
		const where = this.buildEngagementWhere(input, organizationId);
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts] = await Promise.all([
			this.db.acquisitionEngagement.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, ENGAGEMENT_SORTABLE, [
					{ stageChangedAt: "desc" },
					{ createdAt: "desc" },
				]),
				select: ENGAGEMENT_SELECT,
			}),
			this.db.acquisitionEngagement.count({ where }),
			this.engagementFacetCounts(input, organizationId),
		]);

		return {
			rows: rows.map((row) => this.serializeEngagement(row)),
			total,
			facetCounts,
		} satisfies ListResult<ReturnType<typeof this.serializeEngagement>>;
	}

	async engagementTargetOptions(raw: EngagementTargetOptionsInput) {
		const { q } = engagementTargetOptionsInput.parse(raw);
		const organizationId = getOrganizationId() ?? WORKSPACE_ID;
		const term = q.trim();

		return this.db.company.findMany({
			where: {
				organizationId,
				acquisitionTarget: { isNot: null },
				acquisitionEngagements: {
					none: { status: AcquisitionEngagementStatus.ACTIVE },
				},
				...(term
					? { name: { contains: term, mode: "insensitive" as const } }
					: {}),
			},
			orderBy: [{ name: "asc" }],
			select: {
				id: true,
				name: true,
				domain: true,
				iconUrl: true,
				iconDarkUrl: true,
				iconTone: true,
				logoUrl: true,
			},
		});
	}

	async updateEngagementStage(
		input: UpdateAcquisitionEngagementStageInput,
		actingUserId: string,
	) {
		const engagement = await this.db.acquisitionEngagement.findUnique({
			where: { id: input.engagementId },
			select: {
				id: true,
				stage: true,
				status: true,
				companyId: true,
				company: { select: { name: true } },
			},
		});
		if (!engagement) {
			throw new NotFoundException("That engagement no longer exists.");
		}
		if (engagement.status === AcquisitionEngagementStatus.TERMINAL) {
			throw new BadRequestException(TERMINAL_ENGAGEMENT_CONFLICT);
		}

		const terminal = TERMINAL_ENGAGEMENT_STAGES.has(input.stage);
		const updated = await this.db.$transaction(async (tx) => {
			const row = await tx.acquisitionEngagement.update({
				where: { id: input.engagementId },
				data: {
					stage: input.stage,
					status: terminal
						? AcquisitionEngagementStatus.TERMINAL
						: AcquisitionEngagementStatus.ACTIVE,
					stageChangedAt: new Date(),
					closedAt: terminal ? new Date() : null,
				},
				select: ENGAGEMENT_SELECT,
			});
			if (engagement.stage !== input.stage) {
				await tx.activity.create({
					data: {
						type: ActivityType.STAGE_CHANGE,
						subject: `Moved ${engagement.company.name} engagement to ${input.stage.toLowerCase()}`,
						companyId: engagement.companyId,
						engagementId: engagement.id,
						createdById: actingUserId,
					},
				});
			}
			return row;
		});

		return this.serializeEngagement(updated);
	}

	private async loadIdempotentEngagement(
		engagementId: string,
		organizationId: string,
		companyId: string,
	) {
		const engagement = await this.db.acquisitionEngagement.findUnique({
			where: { id: engagementId },
			select: { ...ENGAGEMENT_SELECT, organizationId: true },
		});
		if (!engagement) {
			throw new BadRequestException(IDEMPOTENCY_CONTEXT_CONFLICT);
		}
		if (
			engagement.organizationId !== organizationId ||
			engagement.companyId !== companyId
		) {
			throw new BadRequestException(IDEMPOTENCY_CONTEXT_CONFLICT);
		}
		const { organizationId: _organizationId, ...row } = engagement;
		return this.serializeEngagement(row);
	}

	private async resolveEngagementOwner(
		explicitOwnerId: string | undefined,
		companyOwnerId: string | null,
		actingUserId: string,
		organizationId: string,
	): Promise<string | null> {
		if (explicitOwnerId !== undefined) {
			const member = await this.db.member.findFirst({
				where: { organizationId, userId: explicitOwnerId },
				select: { id: true },
			});
			if (!member) {
				throw new BadRequestException("That owner is not in this workspace.");
			}
			return explicitOwnerId;
		}
		if (companyOwnerId) return companyOwnerId;
		return actingUserId;
	}

	private async recoverCreateEngagement(
		error: unknown,
		input: CreateAcquisitionEngagementInput,
		organizationId: string,
	) {
		if (!isPrismaUniqueViolation(error)) throw error;

		if (isIdempotencyKeyViolation(error)) {
			const prior = await this.db.acquisitionEngagementCreateRequest.findUnique(
				{
					where: { idempotencyKey: input.idempotencyKey },
					select: { engagementId: true },
				},
			);
			if (prior) {
				return this.loadIdempotentEngagement(
					prior.engagementId,
					organizationId,
					input.companyId,
				);
			}
		}

		if (isActiveEngagementViolation(error)) {
			throw new ConflictException(ACTIVE_ENGAGEMENT_CONFLICT);
		}

		throw error;
	}

	private serializeEngagement(row: EngagementRow) {
		return {
			id: row.id,
			companyId: row.companyId,
			ownerId: row.ownerId,
			stage: row.stage,
			status: row.status,
			amountCents: toCents(row.amount),
			baseAmountCents: toCents(row.baseAmount),
			currency: row.currency,
			owner: row.owner,
			company: row.company,
			stageChangedAt: row.stageChangedAt.toISOString(),
			expectedCloseDate: row.expectedCloseDate?.toISOString() ?? null,
			closedAt: row.closedAt?.toISOString() ?? null,
			closedReason: row.closedReason,
			fxRate: row.fxRate?.toNumber() ?? null,
			fxRateAt: row.fxRateAt?.toISOString() ?? null,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	}

	private engagementSearchFilter(
		q: string,
	): Prisma.AcquisitionEngagementWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			OR: [
				{ company: { name: { contains: term, mode: "insensitive" } } },
				{ company: { domain: { contains: term, mode: "insensitive" } } },
			],
		};
	}

	private buildEngagementWhere(
		input: ParsedListAcquisitionEngagementsInput,
		organizationId: string,
	): Prisma.AcquisitionEngagementWhereInput {
		const where: Prisma.AcquisitionEngagementWhereInput = {
			organizationId,
			...this.engagementSearchFilter(input.q),
		};

		if (input.companyId) {
			where.companyId = input.companyId;
		}

		if (input.status === "active") {
			where.status = ENGAGEMENT_STATUS_FILTERS.active;
		} else if (input.status === "terminal") {
			where.status = ENGAGEMENT_STATUS_FILTERS.terminal;
		}

		if (input.owner !== FACET_ALL) {
			const owner = ownerFilter(input.owner);
			if (owner) where.ownerId = owner.ownerId;
		}

		if (input.stage !== FACET_ALL) {
			where.stage = input.stage as AcquisitionEngagementStage;
		}

		return where;
	}

	private async engagementFacetCounts(
		input: ParsedListAcquisitionEngagementsInput,
		organizationId: string,
	) {
		const base: Prisma.AcquisitionEngagementWhereInput = {
			organizationId,
			...this.engagementSearchFilter(input.q),
			...(input.companyId ? { companyId: input.companyId } : {}),
		};

		const [owners, stages, activeCount, terminalCount] = await Promise.all([
			this.db.acquisitionEngagement.groupBy({
				by: ["ownerId"],
				where: base,
				_count: { _all: true },
			}),
			this.db.acquisitionEngagement.groupBy({
				by: ["stage"],
				where: base,
				_count: { _all: true },
			}),
			this.db.acquisitionEngagement.count({
				where: { ...base, status: ENGAGEMENT_STATUS_FILTERS.active },
			}),
			this.db.acquisitionEngagement.count({
				where: { ...base, status: ENGAGEMENT_STATUS_FILTERS.terminal },
			}),
		]);

		return {
			status: { active: activeCount, terminal: terminalCount },
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			stage: countsByKey(stages, "stage"),
		};
	}

	async listResearchRuns(input: z.infer<typeof listResearchRunsInput>) {
		const company = await this.db.company.findUnique({
			where: { id: input.companyId },
			select: { id: true },
		});
		if (!company) {
			throw new NotFoundException("That company no longer exists.");
		}

		const runs = await this.db.acquisitionResearchRun.findMany({
			where: { companyId: input.companyId },
			orderBy: { startedAt: "desc" },
			take: 50,
			select: {
				id: true,
				startedAt: true,
				finishedAt: true,
				status: true,
				kind: true,
				outcome: true,
				dossierSnapshot: true,
				triggeredBy: {
					select: { id: true, name: true },
				},
			},
		});

		return runs.map((run) => {
			const snapshot = researchRunListSnapshot(run.dossierSnapshot);
			return {
				id: run.id,
				startedAt: run.startedAt.toISOString(),
				finishedAt: run.finishedAt?.toISOString() ?? null,
				status: run.status,
				kind: run.kind,
				outcome: run.outcome,
				triggeredBy: run.triggeredBy,
				snapshotFit: snapshot.fit,
				snapshotSummary: snapshot.summary,
			};
		});
	}

	async getResearchRun(input: z.infer<typeof researchRunIdInput>) {
		const run = await this.db.acquisitionResearchRun.findUnique({
			where: { id: input.id },
			select: {
				id: true,
				companyId: true,
				startedAt: true,
				finishedAt: true,
				status: true,
				kind: true,
				outcome: true,
				dossierSnapshot: true,
				triggeredBy: {
					select: { id: true, name: true },
				},
			},
		});
		if (!run) {
			throw new NotFoundException("That research run no longer exists.");
		}

		return {
			id: run.id,
			companyId: run.companyId,
			startedAt: run.startedAt.toISOString(),
			finishedAt: run.finishedAt?.toISOString() ?? null,
			status: run.status,
			kind: run.kind,
			outcome: run.outcome,
			triggeredBy: run.triggeredBy,
			snapshot: parseAcquisitionDossierSnapshot(run.dossierSnapshot),
		};
	}
}

function isPrismaUniqueViolation(
	error: unknown,
): error is PrismaNamespace.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

function isIdempotencyKeyViolation(
	error: PrismaNamespace.PrismaClientKnownRequestError,
): boolean {
	const target = error.meta?.target;
	if (Array.isArray(target)) {
		return target.includes("idempotencyKey");
	}
	return error.meta?.modelName === "AcquisitionEngagementCreateRequest";
}

function isActiveEngagementViolation(
	error: PrismaNamespace.PrismaClientKnownRequestError,
): boolean {
	const constraint = error.meta?.constraint;
	if (constraint === "acquisitionEngagement_one_active_per_company") {
		return true;
	}
	const target = error.meta?.target;
	if (Array.isArray(target)) {
		return (
			target.includes("organizationId") &&
			target.includes("companyId") &&
			!target.includes("idempotencyKey")
		);
	}
	return error.meta?.modelName === "AcquisitionEngagement";
}
