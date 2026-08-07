import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { db } from "@crm/db";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../src/config/env.validation";
import { ConversionService } from "../src/currency/conversion.service";
import { VaultZeroController } from "../src/vault-zero/vault-zero.controller";
import { VaultZeroService } from "../src/vault-zero/vault-zero.service";

const suffix = `vault-zero-${Date.now()}`;
const submissionId = `${suffix}-submission`;
const proposalId = `${suffix}-proposal`;
const companyDomain = `${suffix}.test`;
const leadExternalId = `${suffix}-lead`;
const proposalExternalId = `${suffix}-proposal-event`;
const callExternalId = `${suffix}-call`;
const retryExternalId = `${suffix}-retry`;

const service = new VaultZeroService(db, new ConversionService(db));

async function clean() {
	const companies = await db.company.findMany({
		where: { domain: companyDomain },
		select: { id: true },
	});
	const contacts = await db.contact.findMany({
		where: { email: `owner@${companyDomain}` },
		select: { id: true },
	});
	const companyIds = companies.map((row) => row.id);
	const contactIds = contacts.map((row) => row.id);

	await db.vaultZeroEvent.deleteMany({
		where: { externalId: { startsWith: suffix } },
	});
	await db.vaultZeroLead.deleteMany({ where: { submissionId } });
	await db.vaultZeroProposal.deleteMany({ where: { proposalId } });
	await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.contact.deleteMany({
		where: {
			OR: [
				{ id: { in: contactIds } },
				{ email: `owner@${companyDomain}` },
				{ lastName: `Retry Caller ${suffix}` },
			],
		},
	});
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
}

beforeAll(clean);
afterAll(clean);

describe("Vault Zero CRM ingestion", () => {
	it("accepts only fresh signed event payloads", async () => {
		const secret = "vault-zero-test-secret";
		const body = {
			eventId: `${suffix}-signed`,
			externalId: `${suffix}-signed`,
			type: "lead.upserted",
			occurredAt: new Date().toISOString(),
			payload: {
				lead: {
					submissionId: `${suffix}-signed-submission`,
					source: "contact-form",
					status: "new",
					name: "Signed Lead",
				},
			},
		};
		const timestamp = String(Math.floor(Date.now() / 1000));
		const canonical = `${timestamp}.${body.eventId}.${createHash("sha256")
			.update(JSON.stringify(body))
			.digest("hex")}`;
		const signature = createHmac("sha256", secret)
			.update(canonical)
			.digest("hex");
		const controller = new VaultZeroController(
			{
				ingest: async () => ({
					accepted: true,
					duplicate: false,
					eventId: body.eventId,
				}),
			} as unknown as VaultZeroService,
			new ConfigService<EnvironmentVariables, true>({
				VAULTZERO_INGEST_SECRET: secret,
			}),
		);

		expect(
			await controller.ingest(body.eventId, timestamp, signature, body),
		).toMatchObject({ accepted: true, duplicate: false });
		await expect(
			controller.ingest(body.eventId, timestamp, "bad-signature", body),
		).rejects.toThrow();
	});

	it("upserts a lead, updates its deal from a proposal, and deduplicates calls", async () => {
		const occurredAt = new Date().toISOString();
		const lead = {
			eventId: leadExternalId,
			externalId: leadExternalId,
			type: "lead.upserted" as const,
			occurredAt,
			payload: {
				lead: {
					submissionId,
					source: "requested-demo",
					status: "new",
					name: "Vault Zero Owner",
					email: `owner@${companyDomain}`,
					phone: null,
					company: "Vault Zero Test Company",
					website: `https://${companyDomain}`,
					businessType: "service business",
					selectedPackage: "Growth",
					serviceArea: "Chicago",
					notes: "Test lead",
					attribution: { source: "test" },
					details: {},
				},
			},
		};

		expect(await service.ingest(lead)).toMatchObject({
			accepted: true,
			duplicate: false,
		});
		expect(await service.ingest(lead)).toMatchObject({
			accepted: true,
			duplicate: true,
		});

		const proposal = {
			eventId: proposalExternalId,
			externalId: proposalExternalId,
			type: "proposal.updated" as const,
			occurredAt,
			payload: {
				proposal: {
					proposalId,
					leadSubmissionId: submissionId,
					status: "sent",
					clientName: "Vault Zero Owner",
					clientCompany: "Vault Zero Test Company",
					clientEmail: `owner@${companyDomain}`,
					packageName: "Growth",
					setupFeeCents: 5_000,
					monthlyFeeCents: 5_000,
					timeline: "30 days",
					scope: "CRM implementation",
				},
			},
		};

		expect(await service.ingest(proposal)).toMatchObject({
			accepted: true,
			duplicate: false,
		});

		const deal = await db.deal.findFirst({
			where: { company: { domain: companyDomain } },
			select: { id: true, stage: true, amount: true, baseAmount: true },
		});
		expect(deal?.stage).toBe("CONTRACT_SENT");
		expect(deal?.amount?.toNumber()).toBe(650);
		expect(deal?.baseAmount?.toNumber()).toBe(650);

		const call = {
			eventId: callExternalId,
			externalId: callExternalId,
			type: "call.completed" as const,
			occurredAt,
			payload: {
				call: {
					vapiCallId: `${suffix}-vapi-call`,
					leadSubmissionId: submissionId,
					status: "ended",
					callerName: "Vault Zero Owner",
					callerNumber: null,
					receivingNumber: null,
					startedAt: null,
					endedAt: occurredAt,
					durationSeconds: 120,
					endedReason: "customer-ended-call",
					summary: "Discussed implementation.",
					structuredData: {},
				},
			},
		};

		expect(await service.ingest(call)).toMatchObject({
			accepted: true,
			duplicate: false,
		});
		expect(await service.ingest(call)).toMatchObject({
			accepted: true,
			duplicate: true,
		});

		const sameCallDifferentEvent = {
			...call,
			eventId: `${callExternalId}-retry`,
			externalId: `${callExternalId}-retry`,
		};
		expect(await service.ingest(sameCallDifferentEvent)).toMatchObject({
			accepted: true,
			duplicate: true,
		});

		const processed = await db.vaultZeroEvent.findUnique({
			where: { externalId: callExternalId },
			select: { status: true, attempts: true, vapiCallId: true },
		});
		expect(processed).toEqual({
			status: "PROCESSED",
			attempts: 1,
			vapiCallId: `${suffix}-vapi-call`,
		});
	});

	it("marks failed work for retry instead of losing the event row", async () => {
		const event = {
			eventId: retryExternalId,
			externalId: retryExternalId,
			type: "call.completed" as const,
			occurredAt: new Date().toISOString(),
			payload: {
				call: {
					vapiCallId: `${suffix}-retry-call`,
					leadSubmissionId: null,
					status: "ended",
					callerName: `Unlinked Retry Caller ${suffix}`,
					callerNumber: null,
					receivingNumber: null,
					startedAt: null,
					endedAt: null,
					durationSeconds: null,
					endedReason: null,
					summary: "No linked CRM record",
					structuredData: {},
				},
			},
		};

		await db.vaultZeroEvent.create({
			data: {
				externalId: retryExternalId,
				eventType: event.type,
				occurredAt: new Date(event.occurredAt),
				status: "FAILED",
				payload: event,
				vapiCallId: event.payload.call.vapiCallId,
				attempts: 1,
				lastError: "ConflictException",
			},
		});

		expect(await service.ingest(event)).toMatchObject({
			accepted: true,
			duplicate: false,
		});
		const processed = await db.vaultZeroEvent.findUniqueOrThrow({
			where: { externalId: retryExternalId },
			select: { status: true, attempts: true, lastError: true },
		});
		expect(processed).toEqual({
			status: "PROCESSED",
			attempts: 2,
			lastError: null,
		});
	});
});
