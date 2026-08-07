import {
	ActivityType,
	type Db,
	DealStage,
	Prisma,
	RecordSource,
} from "@crm/db";
import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { normalizeDomain } from "../companies/domain";
import { decimalFromCents, normalizeEmail } from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import { isClosedStage } from "../deals/deal-stage";
import {
	type VaultZeroEvent,
	vaultZeroEventSchema,
} from "./vault-zero.contracts";

const SYSTEM_EMAIL = "vaultzero-integration@vaultzero.dev";
const SYSTEM_NAME = "Vault Zero integration";
const PROCESSING_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class VaultZeroService {
	private readonly logger = new Logger(VaultZeroService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly conversion: ConversionService,
	) {}

	async ingest(input: unknown) {
		const event = vaultZeroEventSchema.parse(input);
		const claim = await this.claim(event);

		if (!claim.process) {
			return {
				accepted: true,
				duplicate: true,
				eventId: event.externalId,
				status: claim.status,
			};
		}

		try {
			return await this.db.$transaction(async (tx) => {
				const systemUser = await tx.user.upsert({
					where: { email: SYSTEM_EMAIL },
					create: {
						id: "vaultzero-integration",
						name: SYSTEM_NAME,
						email: SYSTEM_EMAIL,
						emailVerified: true,
					},
					update: { name: SYSTEM_NAME, emailVerified: true },
				});

				const targets = await this.processEvent(tx, systemUser.id, event);

				await tx.vaultZeroEvent.update({
					where: { externalId: claim.externalId },
					data: {
						status: "PROCESSED",
						processedAt: new Date(),
						lastError: null,
						companyId: targets.companyId,
						contactId: targets.contactId,
						dealId: targets.dealId,
					},
				});

				return {
					accepted: true,
					duplicate: false,
					eventId: event.externalId,
					...targets,
				};
			});
		} catch (error) {
			await this.db.vaultZeroEvent.update({
				where: { externalId: claim.externalId },
				data: { status: "FAILED", lastError: errorName(error) },
			});

			this.logger.error(
				{
					message: "Vault Zero event processing failed",
					eventType: event.type,
				},
				error instanceof Error ? error.stack : String(error),
			);
			throw error;
		}
	}

	private async claim(event: VaultZeroEvent) {
		const now = new Date();
		const vapiCallId =
			event.type === "call.completed" ? event.payload.call.vapiCallId : null;

		try {
			await this.db.vaultZeroEvent.create({
				data: {
					externalId: event.externalId,
					eventType: event.type,
					occurredAt: new Date(event.occurredAt),
					status: "PROCESSING",
					payload: jsonValue(event),
					vapiCallId,
					attempts: 1,
				},
			});

			return {
				process: true,
				status: "PROCESSING" as const,
				externalId: event.externalId,
			};
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
		}

		const existing =
			(await this.db.vaultZeroEvent.findUnique({
				where: { externalId: event.externalId },
			})) ??
			(vapiCallId
				? await this.db.vaultZeroEvent.findUnique({
						where: { vapiCallId },
					})
				: null);

		if (!existing)
			throw new ConflictException("Vault Zero event claim was lost.");
		if (existing.status === "PROCESSED") {
			return {
				process: false,
				status: existing.status,
				externalId: existing.externalId,
			};
		}

		const stale =
			existing.status === "PROCESSING" &&
			now.getTime() - existing.receivedAt.getTime() >= PROCESSING_TTL_MS;
		if (existing.status !== "FAILED" && !stale) {
			return {
				process: false,
				status: existing.status,
				externalId: existing.externalId,
			};
		}

		const claimed = await this.db.vaultZeroEvent.updateMany({
			where: { id: existing.id, status: existing.status },
			data: {
				status: "PROCESSING",
				attempts: { increment: 1 },
				receivedAt: now,
				lastError: null,
				processedAt: null,
			},
		});

		return {
			process: claimed.count === 1,
			status: claimed.count === 1 ? ("PROCESSING" as const) : existing.status,
			externalId: existing.externalId,
		};
	}

	private async processEvent(
		tx: Prisma.TransactionClient,
		systemUserId: string,
		event: VaultZeroEvent,
	) {
		if (event.type === "lead.upserted") {
			return this.processLead(tx, systemUserId, event);
		}

		if (event.type === "proposal.updated") {
			return this.processProposal(tx, systemUserId, event);
		}

		return this.processCall(tx, systemUserId, event);
	}

	private async processLead(
		tx: Prisma.TransactionClient,
		systemUserId: string,
		event: Extract<VaultZeroEvent, { type: "lead.upserted" }>,
	) {
		const lead = event.payload.lead;
		const company = await this.ensureCompany(tx, {
			name: lead.company ?? lead.name,
			website: lead.website,
			description: lead.notes,
			industry: lead.businessType,
		});
		const contact = await this.ensureContact(tx, {
			name: lead.name,
			email: lead.email,
			phone: lead.phone,
			companyId: company.id,
			ownerId: systemUserId,
		});

		const shouldCreateDeal =
			lead.source === "requested-demo" ||
			lead.status === "qualified" ||
			lead.status === "proposal" ||
			lead.status === "won" ||
			lead.status === "lost";
		const stage = dealStageForLead(lead.status, lead.source);
		const deal =
			shouldCreateDeal && stage
				? await this.ensureDeal(tx, {
						companyId: company.id,
						contactId: contact?.id,
						ownerId: systemUserId,
						name: `${company.name} — ${lead.selectedPackage ?? "Vault Zero opportunity"}`,
						description: lead.notes,
						stage,
						leadSubmissionId: lead.submissionId,
					})
				: null;

		await tx.vaultZeroLead.upsert({
			where: { submissionId: lead.submissionId },
			create: {
				submissionId: lead.submissionId,
				source: lead.source,
				status: lead.status,
				payload: jsonValue(lead),
				companyId: company.id,
				contactId: contact?.id,
				dealId: deal?.id,
			},
			update: {
				source: lead.source,
				status: lead.status,
				payload: jsonValue(lead),
				companyId: company.id,
				contactId: contact?.id,
				dealId: deal?.id,
			},
		});

		await this.recordActivity(tx, {
			type:
				lead.source === "requested-demo"
					? ActivityType.MEETING
					: ActivityType.NOTE,
			subject: `Vault Zero ${lead.source.replaceAll("-", " ")} received`,
			body: formatLeadActivity(lead),
			companyId: company.id,
			contactId: contact?.id,
			dealId: deal?.id,
			createdById: systemUserId,
			occurredAt: new Date(event.occurredAt),
			meta: jsonValue({
				source: "vaultzero",
				externalId: event.externalId,
				attribution: lead.attribution,
			}),
		});

		return { companyId: company.id, contactId: contact?.id, dealId: deal?.id };
	}

	private async processProposal(
		tx: Prisma.TransactionClient,
		systemUserId: string,
		event: Extract<VaultZeroEvent, { type: "proposal.updated" }>,
	) {
		const proposal = event.payload.proposal;
		const linkedLead = proposal.leadSubmissionId
			? await tx.vaultZeroLead.findUnique({
					where: { submissionId: proposal.leadSubmissionId },
				})
			: null;
		const storedProposal = await tx.vaultZeroProposal.findUnique({
			where: { proposalId: proposal.proposalId },
		});
		const companyId = linkedLead?.companyId ?? storedProposal?.companyId;
		const contactId = linkedLead?.contactId ?? storedProposal?.contactId;
		const company = companyId
			? await tx.company.findUniqueOrThrow({
					where: { id: companyId },
				})
			: await this.ensureCompany(tx, {
					name: proposal.clientCompany,
					industry: "service business",
				});
		const contact = contactId
			? await tx.contact.findUniqueOrThrow({
					where: { id: contactId },
				})
			: await this.ensureContact(tx, {
					name: proposal.clientName,
					email: proposal.clientEmail,
					companyId: company.id,
					ownerId: systemUserId,
				});
		const stage = proposalStage(proposal.status);
		const deal = await this.ensureDeal(tx, {
			companyId: company.id,
			contactId: contact?.id,
			ownerId: systemUserId,
			name: `${company.name} — ${proposal.packageName}`,
			description: `${proposal.scope}\n\nTimeline: ${proposal.timeline}\n\nSetup fee: ${formatUsdCents(proposal.setupFeeCents)}\nMonthly fee: ${formatUsdCents(proposal.monthlyFeeCents)}`,
			stage,
			leadSubmissionId: proposal.leadSubmissionId,
			proposalId: proposal.proposalId,
			existingDealId: storedProposal?.dealId,
			amountCents: proposal.setupFeeCents + proposal.monthlyFeeCents * 12,
			currency: "USD",
			closedReason:
				stage === DealStage.CLOSED_LOST ? "Vault Zero proposal declined" : null,
		});

		await tx.vaultZeroProposal.upsert({
			where: { proposalId: proposal.proposalId },
			create: {
				proposalId: proposal.proposalId,
				leadSubmissionId: proposal.leadSubmissionId,
				status: proposal.status,
				payload: jsonValue(proposal),
				companyId: company.id,
				contactId: contact?.id,
				dealId: deal.id,
			},
			update: {
				leadSubmissionId: proposal.leadSubmissionId,
				status: proposal.status,
				payload: jsonValue(proposal),
				companyId: company.id,
				contactId: contact?.id,
				dealId: deal.id,
			},
		});

		if (linkedLead) {
			await tx.vaultZeroLead.update({
				where: { id: linkedLead.id },
				data: {
					dealId: deal.id,
					companyId: company.id,
					contactId: contact?.id,
				},
			});
		}

		await this.recordActivity(tx, {
			type: ActivityType.NOTE,
			subject: `Vault Zero proposal ${proposal.status}`,
			body: `${proposal.packageName}. Setup fee and monthly pricing remain in Vault Zero.`,
			companyId: company.id,
			contactId: contact?.id,
			dealId: deal.id,
			createdById: systemUserId,
			occurredAt: new Date(event.occurredAt),
			meta: jsonValue({
				source: "vaultzero",
				externalId: event.externalId,
				proposalId: proposal.proposalId,
				annualValueCents:
					proposal.setupFeeCents + proposal.monthlyFeeCents * 12,
			}),
		});

		return { companyId: company.id, contactId: contact?.id, dealId: deal.id };
	}

	private async processCall(
		tx: Prisma.TransactionClient,
		systemUserId: string,
		event: Extract<VaultZeroEvent, { type: "call.completed" }>,
	) {
		const call = event.payload.call;
		const linkedLead = call.leadSubmissionId
			? await tx.vaultZeroLead.findUnique({
					where: { submissionId: call.leadSubmissionId },
				})
			: null;
		const company = linkedLead?.companyId
			? await tx.company.findUnique({ where: { id: linkedLead.companyId } })
			: null;
		const contact = linkedLead?.contactId
			? await tx.contact.findUnique({ where: { id: linkedLead.contactId } })
			: await this.ensureContact(tx, {
					name: call.callerName ?? "Unknown caller",
					phone: call.callerNumber,
					companyId: company?.id,
					ownerId: systemUserId,
				});

		await this.recordActivity(tx, {
			type: ActivityType.CALL,
			subject: "Vault Zero call completed",
			body:
				call.summary ??
				`Call completed with ${call.callerName ?? "unknown caller"}.`,
			companyId: company?.id,
			contactId: contact?.id,
			dealId: linkedLead?.dealId ?? undefined,
			createdById: systemUserId,
			occurredAt: new Date(call.endedAt ?? event.occurredAt),
			meta: jsonValue({
				source: "vaultzero",
				externalId: event.externalId,
				vapiCallId: call.vapiCallId,
				durationSeconds: call.durationSeconds ?? null,
				endedReason: call.endedReason ?? null,
				structuredData: call.structuredData,
			}),
		});

		return {
			companyId: company?.id,
			contactId: contact?.id,
			dealId: linkedLead?.dealId,
		};
	}

	private async ensureCompany(
		tx: Prisma.TransactionClient,
		input: {
			name: string;
			website?: string | null;
			description?: string | null;
			industry?: string | null;
		},
	) {
		const name = input.name.trim() || "Unknown company";
		const domain = normalizeDomain(input.website);
		const existing = domain
			? await tx.company.findUnique({ where: { domain } })
			: await tx.company.findFirst({
					where: { name: { equals: name, mode: "insensitive" } },
				});

		if (existing) {
			return tx.company.update({
				where: { id: existing.id },
				data: {
					website: input.website ?? existing.website,
					description: input.description ?? existing.description,
					industry: input.industry ?? existing.industry,
				},
			});
		}

		return tx.company.create({
			data: {
				name,
				domain,
				website: input.website ?? null,
				description: input.description ?? null,
				industry: input.industry ?? null,
				source: RecordSource.VAULT_ZERO,
			},
		});
	}

	private async ensureContact(
		tx: Prisma.TransactionClient,
		input: {
			name: string;
			email?: string | null;
			phone?: string | null;
			companyId?: string;
			ownerId: string;
		},
	) {
		const email = normalizeEmail(input.email ?? "");
		const existing = email
			? await tx.contact.findUnique({ where: { email } })
			: input.companyId
				? await tx.contact.findFirst({
						where: {
							companyId: input.companyId,
							firstName: {
								equals: splitName(input.name).firstName,
								mode: "insensitive",
							},
							lastName: {
								equals: splitName(input.name).lastName,
								mode: "insensitive",
							},
						},
					})
				: null;
		const name = splitName(input.name);

		if (existing) {
			return tx.contact.update({
				where: { id: existing.id },
				data: {
					firstName: name.firstName,
					lastName: name.lastName,
					email: email ?? existing.email,
					phone: input.phone ?? existing.phone,
					companyId: input.companyId ?? existing.companyId,
					ownerId: existing.ownerId ?? input.ownerId,
				},
			});
		}

		return tx.contact.create({
			data: {
				firstName: name.firstName,
				lastName: name.lastName,
				email,
				phone: input.phone ?? null,
				companyId: input.companyId ?? null,
				ownerId: input.ownerId,
				source: RecordSource.VAULT_ZERO,
			},
		});
	}

	private async ensureDeal(
		tx: Prisma.TransactionClient,
		input: {
			companyId: string;
			contactId?: string;
			ownerId: string;
			name: string;
			description?: string | null;
			stage: DealStage;
			leadSubmissionId?: string | null;
			proposalId?: string | null;
			existingDealId?: string | null;
			amountCents?: number | null;
			currency?: string;
			closedReason?: string | null;
		},
	) {
		const linkedLead = input.leadSubmissionId
			? await tx.vaultZeroLead.findUnique({
					where: { submissionId: input.leadSubmissionId },
				})
			: null;
		const existingDealId = input.existingDealId ?? linkedLead?.dealId;
		const existing = existingDealId
			? await tx.deal.findUnique({ where: { id: existingDealId } })
			: null;
		const amount =
			input.amountCents !== undefined
				? decimalFromCents(input.amountCents)
				: (existing?.amount ?? null);
		const currency = input.currency ?? existing?.currency ?? "USD";
		const fx = await this.conversion.dealFields(amount, currency);
		const now = new Date();

		const deal = existing
			? await tx.deal.update({
					where: { id: existing.id },
					data: {
						name: input.name,
						description: input.description ?? existing.description,
						stage: input.stage,
						stageChangedAt:
							existing.stage === input.stage ? existing.stageChangedAt : now,
						closedAt: isClosedStage(input.stage)
							? (existing.closedAt ?? now)
							: null,
						closedReason: input.closedReason ?? existing.closedReason,
						amount,
						currency,
						...fx,
					},
				})
			: await tx.deal.create({
					data: {
						name: input.name,
						description: input.description ?? null,
						companyId: input.companyId,
						ownerId: input.ownerId,
						stage: input.stage,
						stageChangedAt: now,
						closedAt: isClosedStage(input.stage) ? now : null,
						closedReason: input.closedReason ?? null,
						amount,
						currency,
						...fx,
					},
				});

		if (input.contactId) {
			await tx.dealContact.upsert({
				where: {
					dealId_contactId: { dealId: deal.id, contactId: input.contactId },
				},
				create: { dealId: deal.id, contactId: input.contactId },
				update: {},
			});
		}

		return deal;
	}

	private async recordActivity(
		tx: Prisma.TransactionClient,
		input: {
			type: ActivityType;
			subject: string;
			body: string;
			companyId?: string;
			contactId?: string;
			dealId?: string;
			createdById: string;
			occurredAt: Date;
			meta: Prisma.InputJsonValue;
		},
	) {
		const activity = await tx.activity.create({ data: input });
		const ids = [input.companyId, input.contactId, input.dealId].filter(
			(value): value is string => Boolean(value),
		);
		await Promise.all([
			input.companyId
				? tx.company.update({
						where: { id: input.companyId },
						data: { lastActivityAt: input.occurredAt },
					})
				: Promise.resolve(),
			input.contactId
				? tx.contact.update({
						where: { id: input.contactId },
						data: { lastActivityAt: input.occurredAt },
					})
				: Promise.resolve(),
			input.dealId
				? tx.deal.update({
						where: { id: input.dealId },
						data: { lastActivityAt: input.occurredAt },
					})
				: Promise.resolve(),
		]);
		if (ids.length === 0)
			throw new ConflictException("Vault Zero activity has no CRM target.");
		return activity;
	}
}

function splitName(value: string) {
	const parts = value.trim().split(/\s+/).filter(Boolean);
	return {
		firstName: parts[0] ?? "Unknown",
		lastName: parts.slice(1).join(" ") || null,
	};
}

function dealStageForLead(status: string, source: string): DealStage | null {
	if (source === "requested-demo" && status === "new")
		return DealStage.DEMO_BOOKED;
	return (
		{
			qualified: DealStage.QUALIFIED_TO_BUY,
			proposal: DealStage.CONTRACT_SENT,
			won: DealStage.CLOSED_WON,
			lost: DealStage.CLOSED_LOST,
		}[status as "qualified" | "proposal" | "won" | "lost"] ?? null
	);
}

function proposalStage(status: string): DealStage {
	if (status === "accepted" || status === "paid") return DealStage.CLOSED_WON;
	if (status === "declined") return DealStage.CLOSED_LOST;
	return DealStage.CONTRACT_SENT;
}

function formatLeadActivity(
	lead: Extract<VaultZeroEvent, { type: "lead.upserted" }>["payload"]["lead"],
) {
	const details = [
		lead.businessType ? `Business: ${lead.businessType}` : null,
		lead.selectedPackage ? `Package: ${lead.selectedPackage}` : null,
		lead.serviceArea ? `Service area: ${lead.serviceArea}` : null,
		lead.notes ? `Notes: ${lead.notes}` : null,
	].filter(Boolean);
	return details.join("\n") || "Vault Zero intake received.";
}

function formatUsdCents(cents: number): string {
	return `$${(cents / 100).toFixed(2)} USD`;
}

function isUniqueViolation(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : "UnknownError";
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(value) ?? "null") as Prisma.InputJsonValue;
}
