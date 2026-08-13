import { WORKSPACE_ID } from "@crm/auth";
import {
	AcquisitionCandidateStatus,
	AcquisitionFit,
	ActivityType,
	type Db,
	DealStage,
	type Prisma,
	WorkspaceMode,
} from "@crm/db";
import { ACQUISITION_TASK_KINDS } from "@crm/db/acquisition";
import { Injectable } from "@nestjs/common";
import { acquisitionTargetWhere } from "../acquisition/acquisition-where";
import { toCents } from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import { OPEN_DEAL_STAGES } from "../deals/deal-stage";
import {
	ACQUISITION_STALE_DAYS,
	visibleCriteriaCount,
} from "./acquisition-summary";
import type { DashboardSummaryInput } from "./dashboard.contracts";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const TREND_MONTHS = 6;

const RATE_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "short" });

function monthStart(from: Date, offset: number): Date {
	return new Date(from.getFullYear(), from.getMonth() + offset, 1);
}

function monthKey(date: Date): number {
	return date.getFullYear() * 12 + date.getMonth();
}

@Injectable()
export class DashboardService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly conversion: ConversionService,
	) {}

	async summary(actingUserId: string, input: DashboardSummaryInput) {
		const mine = input.scope === "me";
		const owned = mine ? { ownerId: actingUserId } : {};
		const now = new Date();
		const acquisitionProfile = await this.db.acquisitionProfile.findUnique({
			where: { id: WORKSPACE_ID },
		});

		if (acquisitionProfile?.mode === WorkspaceMode.ACQUISITION) {
			return {
				scope: input.scope,
				mode: "ACQUISITION" as const,
				...emptySalesSummary(acquisitionProfile.currency, now),
				acquisition: await this.acquisitionSummary(
					actingUserId,
					mine,
					acquisitionProfile,
					now,
				),
			};
		}

		const startOfMonth = monthStart(now, 0);
		const startOfNextMonth = monthStart(now, 1);
		const startOfPrevMonth = monthStart(now, -1);
		const trendStart = monthStart(now, -(TREND_MONTHS - 1));
		const rateStart = new Date(now.getTime() - RATE_WINDOW_DAYS * DAY_MS);

		const base = await this.conversion.reportingCurrency();
		const counted = this.conversion.countedWhere(base);

		const [
			openByStage,
			openValueByStage,
			recentDeals,
			closingThisMonthTotals,
			biggestOpen,
			overdueTasks,
			recentActivity,
			unconverted,
			vaultZeroLeads,
			vaultZeroLeadCount,
			vaultZeroProposals,
			vaultZeroProposalCount,
		] = await Promise.all([
			this.db.deal.groupBy({
				by: ["stage"],
				where: { ...owned, stage: { in: [...OPEN_DEAL_STAGES] } },
				_count: { _all: true },
			}),
			this.db.deal.groupBy({
				by: ["stage"],
				where: {
					AND: [{ ...owned, stage: { in: [...OPEN_DEAL_STAGES] } }, counted],
				},
				_sum: { baseAmount: true },
			}),
			this.db.deal.findMany({
				where: {
					...owned,
					OR: [
						{ createdAt: { gte: trendStart } },
						{ closedAt: { gte: trendStart } },
					],
				},
				select: {
					baseAmount: true,
					baseCurrency: true,
					stage: true,
					createdAt: true,
					closedAt: true,
				},
			}),
			this.db.deal.aggregate({
				where: {
					AND: [
						{
							...owned,
							stage: { in: [...OPEN_DEAL_STAGES] },
							expectedCloseDate: { gte: startOfMonth, lt: startOfNextMonth },
						},
						counted,
					],
				},
				_count: { _all: true },
				_sum: { baseAmount: true },
			}),
			this.db.deal.findMany({
				where: { ...owned, stage: { in: [...OPEN_DEAL_STAGES] } },
				orderBy: [
					{ baseAmount: { sort: "desc", nulls: "last" } },
					{ expectedCloseDate: "asc" },
				],
				take: 6,
				select: {
					id: true,
					name: true,
					stage: true,
					amount: true,
					currency: true,
					baseAmount: true,
					baseCurrency: true,
					expectedCloseDate: true,
					stageChangedAt: true,
					company: {
						select: {
							id: true,
							name: true,
							iconUrl: true,
							iconDarkUrl: true,
							iconTone: true,
						},
					},
					owner: { select: OWNER_SELECT },
				},
			}),
			this.db.activity.findMany({
				where: {
					type: ActivityType.TASK,
					completedAt: null,
					dueAt: { lt: now },
					createdById: actingUserId,
				},
				orderBy: [{ dueAt: "asc" }],
				take: 10,
				select: {
					id: true,
					subject: true,
					dueAt: true,
					company: { select: { id: true, name: true } },
					deal: { select: { id: true, name: true } },
				},
			}),
			this.db.activity.findMany({
				where: mine ? { createdById: actingUserId } : {},
				orderBy: [{ createdAt: "desc" }],
				take: 12,
				select: {
					id: true,
					type: true,
					subject: true,
					body: true,
					createdAt: true,
					meta: true,
					createdBy: { select: OWNER_SELECT },
					company: { select: { id: true, name: true } },
					deal: { select: { id: true, name: true } },
				},
			}),
			this.conversion.unconverted(owned),
			this.db.vaultZeroLead.findMany({
				where: { status: { notIn: ["won", "lost"] } },
				orderBy: [{ createdAt: "desc" }],
				take: 6,
				select: {
					submissionId: true,
					source: true,
					status: true,
					payload: true,
					companyId: true,
					contactId: true,
					dealId: true,
					createdAt: true,
				},
			}),
			this.db.vaultZeroLead.count({
				where: { status: { notIn: ["won", "lost"] } },
			}),
			this.db.vaultZeroProposal.findMany({
				where: { status: { in: ["sent", "viewed"] } },
				orderBy: [{ updatedAt: "desc" }],
				take: 6,
				select: {
					proposalId: true,
					status: true,
					payload: true,
					companyId: true,
					contactId: true,
					dealId: true,
					updatedAt: true,
				},
			}),
			this.db.vaultZeroProposal.count({
				where: { status: { in: ["sent", "viewed"] } },
			}),
		]);

		const stages = OPEN_DEAL_STAGES.map((stage) => {
			const group = openByStage.find((row) => row.stage === stage);
			const value = openValueByStage.find((row) => row.stage === stage);
			return {
				stage: stage as DealStage,
				count: group?._count._all ?? 0,
				valueCents: toCents(value?._sum.baseAmount ?? null) ?? 0,
			};
		});

		const firstBucket = monthKey(trendStart);
		const trend = Array.from({ length: TREND_MONTHS }, (_, index) => ({
			month: MONTH_LABEL.format(monthStart(trendStart, index)),
			won: 0,
			created: 0,
		}));

		const wonThisMonth = { count: 0, valueCents: 0 };
		const wonPrevMonth = { count: 0, valueCents: 0 };
		let wins = 0;
		let losses = 0;
		let valuedWins = 0;
		let wonCents = 0;
		let cycleDays = 0;

		for (const deal of recentDeals) {
			const valued =
				deal.baseCurrency === base ? toCents(deal.baseAmount) : null;
			const cents = valued ?? 0;

			const created = trend[monthKey(deal.createdAt) - firstBucket];
			if (created) created.created += cents;

			const { closedAt, stage } = deal;
			if (!closedAt) continue;
			const won = stage === DealStage.CLOSED_WON;

			if (won) {
				const closed = trend[monthKey(closedAt) - firstBucket];
				if (closed) closed.won += cents;

				if (closedAt >= startOfMonth && closedAt < startOfNextMonth) {
					wonThisMonth.count += 1;
					wonThisMonth.valueCents += cents;
				} else if (closedAt >= startOfPrevMonth && closedAt < startOfMonth) {
					wonPrevMonth.count += 1;
					wonPrevMonth.valueCents += cents;
				}
			}

			if (closedAt < rateStart) continue;
			if (won) {
				wins += 1;
				if (valued !== null) {
					valuedWins += 1;
					wonCents += cents;
				}
				cycleDays += (closedAt.getTime() - deal.createdAt.getTime()) / DAY_MS;
			} else if (stage === DealStage.CLOSED_LOST) {
				losses += 1;
			}
		}

		const decided = wins + losses;

		return {
			scope: input.scope,
			mode: "SALES" as const,
			acquisition: null,
			reportingCurrency: base,
			unconverted,
			pipeline: {
				stages,
				totalCents: stages.reduce((total, s) => total + s.valueCents, 0),
				totalDeals: stages.reduce((total, s) => total + s.count, 0),
			},
			wonThisMonth,
			wonPrevMonth,
			performance: {
				windowDays: RATE_WINDOW_DAYS,
				wins,
				losses,
				winRate: decided === 0 ? null : wins / decided,
				avgDealCents:
					valuedWins === 0 ? null : Math.round(wonCents / valuedWins),
				avgCycleDays: wins === 0 ? null : Math.round(cycleDays / wins),
			},
			trend,
			closingThisMonthTotal: {
				count: closingThisMonthTotals._count._all,
				valueCents: toCents(closingThisMonthTotals._sum.baseAmount) ?? 0,
			},
			biggestOpen: biggestOpen
				.map(
					({
						amount,
						baseAmount,
						baseCurrency,
						expectedCloseDate,
						stageChangedAt,
						...deal
					}) => ({
						...deal,
						amountCents: toCents(amount),
						baseAmountCents: baseCurrency === base ? toCents(baseAmount) : null,
						expectedCloseDate: expectedCloseDate?.toISOString() ?? null,
						stageChangedAt: stageChangedAt.toISOString(),
					}),
				)
				.sort((a, b) => (b.baseAmountCents ?? -1) - (a.baseAmountCents ?? -1)),
			overdueTasks: overdueTasks.map(({ dueAt, ...task }) => ({
				...task,
				dueAt: dueAt?.toISOString() ?? null,
			})),
			recentActivity: recentActivity.map(({ createdAt, meta, ...entry }) => ({
				...entry,
				createdAt: createdAt.toISOString(),
				meta: meta as Record<string, unknown> | null,
			})),
			vaultZero: {
				leads: {
					count: vaultZeroLeadCount,
					items: vaultZeroLeads.map(({ createdAt, payload, ...lead }) => ({
						...lead,
						title: payloadText(payload, "name") ?? "New lead",
						detail:
							payloadText(payload, "company") ?? payloadText(payload, "email"),
						createdAt: createdAt.toISOString(),
					})),
				},
				proposals: {
					count: vaultZeroProposalCount,
					items: vaultZeroProposals.map(
						({ updatedAt, payload, ...proposal }) => ({
							...proposal,
							title: payloadText(payload, "clientCompany") ?? "Proposal",
							detail: payloadText(payload, "packageName"),
							annualValueCents: proposalValueCents(payload),
							updatedAt: updatedAt.toISOString(),
						}),
					),
				},
			},
		};
	}

	private async acquisitionSummary(
		actingUserId: string,
		mine: boolean,
		profile: Prisma.AcquisitionProfileGetPayload<object> | null,
		now: Date,
	) {
		const companyWhere: Prisma.CompanyWhereInput = mine
			? { ownerId: actingUserId }
			: {};
		const activeTargetWhere = acquisitionTargetWhere("active", companyWhere);
		const dealWhere: Prisma.DealWhereInput = mine
			? { ownerId: actingUserId }
			: {};
		const staleBefore = new Date(
			now.getTime() - ACQUISITION_STALE_DAYS * DAY_MS,
		);
		const hasVisibleCriteria = visibleCriteriaCount(profile) > 0;

		const [
			totalTargets,
			visibleMatches,
			needsResearch,
			staleTargets,
			activeAcquisitions,
			missingNextActions,
			activeOpportunities,
			nextActionCount,
			nextActions,
			priorityTargets,
			candidateCount,
			candidates,
			activeAgentWork,
		] = await Promise.all([
			this.db.acquisitionTarget.count({ where: activeTargetWhere }),
			hasVisibleCriteria
				? this.db.acquisitionTarget.count({
						where: {
							AND: [
								activeTargetWhere,
								{
									fit: {
										in: [AcquisitionFit.STRONG, AcquisitionFit.POTENTIAL],
									},
								},
							],
						},
					})
				: Promise.resolve(null),
			this.db.acquisitionTarget.count({
				where: {
					AND: [activeTargetWhere, { researchedAt: null }],
				},
			}),
			this.db.acquisitionTarget.count({
				where: {
					AND: [activeTargetWhere, { researchedAt: { lt: staleBefore } }],
				},
			}),
			this.db.deal.count({
				where: {
					...dealWhere,
					stage: { in: [...OPEN_DEAL_STAGES] },
				},
			}),
			this.db.deal.count({
				where: {
					...dealWhere,
					stage: { in: [...OPEN_DEAL_STAGES] },
					activities: {
						none: { type: ActivityType.TASK, completedAt: null },
					},
				},
			}),
			this.db.deal.findMany({
				where: {
					...dealWhere,
					stage: { in: [...OPEN_DEAL_STAGES] },
				},
				orderBy: [{ stageChangedAt: "asc" }, { createdAt: "desc" }],
				take: 6,
				select: {
					id: true,
					name: true,
					stageChangedAt: true,
					company: { select: { id: true, name: true } },
					_count: {
						select: {
							activities: {
								where: { type: ActivityType.TASK, completedAt: null },
							},
						},
					},
				},
			}),
			this.db.activity.count({
				where: {
					type: ActivityType.TASK,
					completedAt: null,
					createdById: actingUserId,
				},
			}),
			this.db.activity.findMany({
				where: {
					type: ActivityType.TASK,
					completedAt: null,
					createdById: actingUserId,
				},
				orderBy: [
					{ dueAt: { sort: "asc", nulls: "last" } },
					{ createdAt: "desc" },
				],
				take: 5,
				select: {
					id: true,
					subject: true,
					dueAt: true,
					company: { select: { id: true, name: true } },
					contact: {
						select: { id: true, firstName: true, lastName: true },
					},
					deal: { select: { id: true, name: true } },
				},
			}),
			this.db.acquisitionTarget.findMany({
				where: {
					AND: [
						activeTargetWhere,
						{
							fit: {
								in: [AcquisitionFit.STRONG, AcquisitionFit.POTENTIAL],
							},
						},
					],
				},
				orderBy: [{ researchedAt: "desc" }, { updatedAt: "desc" }],
				take: 8,
				select: {
					fit: true,
					stage: true,
					summary: true,
					recommendedAction: true,
					researchedAt: true,
					company: {
						select: {
							id: true,
							name: true,
							industry: true,
							city: true,
							stateCode: true,
							iconUrl: true,
							iconDarkUrl: true,
							iconTone: true,
						},
					},
				},
			}),
			this.db.acquisitionCandidate.count({
				where: { status: AcquisitionCandidateStatus.PROPOSED },
			}),
			this.db.acquisitionCandidate.findMany({
				where: { status: AcquisitionCandidateStatus.PROPOSED },
				orderBy: { createdAt: "desc" },
				take: 6,
				select: {
					id: true,
					name: true,
					domain: true,
					rationale: true,
					evidence: true,
					sourceUrl: true,
					sourceTitle: true,
					createdAt: true,
				},
			}),
			this.db.agentTask.count({
				where: {
					kind: { in: [...ACQUISITION_TASK_KINDS] },
					finishedAt: null,
				},
			}),
		]);

		return {
			totalTargets,
			visibleMatches,
			visibleCriteria: visibleCriteriaCount(profile),
			needsResearch,
			staleTargets,
			staleAfterDays: ACQUISITION_STALE_DAYS,
			activeAgentWork,
			priorityTargets: priorityTargets
				.sort((left, right) => fitRank(right.fit) - fitRank(left.fit))
				.slice(0, 6)
				.map(({ researchedAt, ...target }) => ({
					...target,
					researchedAt: researchedAt?.toISOString() ?? null,
				})),
			discovery: {
				count: candidateCount,
				items: candidates.map(({ createdAt, ...candidate }) => ({
					...candidate,
					createdAt: createdAt.toISOString(),
				})),
			},
			activeAcquisitions,
			missingNextActions,
			activeOpportunities: activeOpportunities.map(
				({ stageChangedAt, _count, ...opportunity }) => ({
					...opportunity,
					stageChangedAt: stageChangedAt.toISOString(),
					hasNextAction: _count.activities > 0,
				}),
			),
			nextActionCount,
			nextActions: nextActions.map(({ dueAt, ...task }) => ({
				...task,
				dueAt: dueAt?.toISOString() ?? null,
			})),
		};
	}
}

function fitRank(fit: AcquisitionFit): number {
	return fit === AcquisitionFit.STRONG
		? 2
		: fit === AcquisitionFit.POTENTIAL
			? 1
			: 0;
}

function payloadText(payload: unknown, key: string): string | null {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return null;
	}

	const value = (payload as Record<string, unknown>)[key];
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function proposalValueCents(payload: unknown): number | null {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return null;
	}

	const value = payload as Record<string, unknown>;
	const setupFeeCents = value.setupFeeCents;
	const monthlyFeeCents = value.monthlyFeeCents;
	if (
		typeof setupFeeCents !== "number" ||
		typeof monthlyFeeCents !== "number" ||
		!Number.isSafeInteger(setupFeeCents) ||
		!Number.isSafeInteger(monthlyFeeCents)
	) {
		return null;
	}

	return setupFeeCents + monthlyFeeCents * 12;
}

function emptySalesSummary(reportingCurrency: string, now: Date) {
	const trendStart = monthStart(now, -(TREND_MONTHS - 1));
	const stages = OPEN_DEAL_STAGES.map((stage) => ({
		stage,
		count: 0,
		valueCents: 0,
	}));

	return {
		reportingCurrency,
		unconverted: { count: 0, currencies: [] as string[] },
		pipeline: { stages, totalCents: 0, totalDeals: 0 },
		wonThisMonth: { count: 0, valueCents: 0 },
		wonPrevMonth: { count: 0, valueCents: 0 },
		performance: {
			windowDays: RATE_WINDOW_DAYS,
			wins: 0,
			losses: 0,
			winRate: null,
			avgDealCents: null,
			avgCycleDays: null,
		},
		trend: Array.from({ length: TREND_MONTHS }, (_, index) => ({
			month: MONTH_LABEL.format(monthStart(trendStart, index)),
			won: 0,
			created: 0,
		})),
		closingThisMonthTotal: { count: 0, valueCents: 0 },
		biggestOpen: [],
		overdueTasks: [],
		recentActivity: [],
		vaultZero: {
			leads: { count: 0, items: [] },
			proposals: { count: 0, items: [] },
		},
	};
}
