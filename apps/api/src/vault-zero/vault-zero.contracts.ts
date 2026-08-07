import { z } from "zod";
import { MAX_AMOUNT_CENTS } from "../deals/deals.contracts";

const optionalText = (maximum: number) =>
	z.string().max(maximum).nullable().optional();

const attributionSchema = z.record(z.string(), z.unknown()).default({});

const leadSchema = z.object({
	submissionId: z.string().min(1).max(200),
	source: z.string().min(1).max(80),
	status: z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]),
	name: z.string().min(1).max(160),
	email: optionalText(254),
	phone: optionalText(80),
	company: optionalText(200),
	website: optionalText(500),
	businessType: optionalText(120),
	selectedPackage: optionalText(120),
	serviceArea: optionalText(500),
	notes: optionalText(10_000),
	attribution: attributionSchema,
	details: z.record(z.string(), z.unknown()).default({}),
});

const proposalSchema = z
	.object({
		proposalId: z.string().min(1).max(200),
		leadSubmissionId: optionalText(200),
		status: z.enum(["draft", "sent", "viewed", "accepted", "declined", "paid"]),
		clientName: z.string().min(1).max(160),
		clientCompany: z.string().min(1).max(240),
		clientEmail: optionalText(254),
		packageName: z.string().min(1).max(240),
		setupFeeCents: z.number().int().min(0).max(MAX_AMOUNT_CENTS),
		monthlyFeeCents: z.number().int().min(0).max(MAX_AMOUNT_CENTS),
		timeline: z.string().max(2_000),
		scope: z.string().max(20_000),
	})
	.refine(
		(value) =>
			value.setupFeeCents + value.monthlyFeeCents * 12 <= MAX_AMOUNT_CENTS,
		{ message: "Proposal value is too large to record." },
	);

const callSchema = z.object({
	vapiCallId: z.string().min(1).max(240),
	leadSubmissionId: optionalText(200),
	status: z.string().max(80),
	callerName: optionalText(160),
	callerNumber: optionalText(80),
	receivingNumber: optionalText(80),
	startedAt: optionalText(80),
	endedAt: optionalText(80),
	durationSeconds: z.number().int().min(0).nullable().optional(),
	endedReason: optionalText(240),
	summary: optionalText(20_000),
	structuredData: z.record(z.string(), z.unknown()).default({}),
});

const leadEvent = z.object({
	eventId: z.string().min(1).max(240),
	externalId: z.string().min(1).max(300),
	type: z.literal("lead.upserted"),
	occurredAt: z.iso.datetime(),
	payload: z.object({ lead: leadSchema }),
});

const proposalEvent = z.object({
	eventId: z.string().min(1).max(240),
	externalId: z.string().min(1).max(300),
	type: z.literal("proposal.updated"),
	occurredAt: z.iso.datetime(),
	payload: z.object({ proposal: proposalSchema }),
});

const callEvent = z.object({
	eventId: z.string().min(1).max(240),
	externalId: z.string().min(1).max(300),
	type: z.literal("call.completed"),
	occurredAt: z.iso.datetime(),
	payload: z.object({ call: callSchema }),
});

export const vaultZeroEventSchema = z.discriminatedUnion("type", [
	leadEvent,
	proposalEvent,
	callEvent,
]);

export type VaultZeroEvent = z.infer<typeof vaultZeroEventSchema>;
