import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { EmailSendService } from "../src/google/email-send.service";
import type { GmailClient } from "../src/google/gmail.client";
import type { GoogleTokenService } from "../src/google/google-token.service";

const input = {
	idempotencyKey: "session-123456789:turn-1",
	userId: "user-1",
	organizationId: "org-1",
	to: ["person@example.com"],
	cc: [],
	subject: "Hello ✓",
	body: "Hello there,\n\nWould Tuesday work?",
};

function harness(connected = true, reply = false, ambiguous = false) {
	let ledger: Record<string, unknown> | null = null;
	let submissions = 0;
	let submittedRaw = "";

	const db = {
		member: { findUnique: async () => ({ id: "member-1" }) },
		emailThread: {
			findFirst: async () =>
				reply
					? {
							messages: [
								{
									gmailMessageId: "gmail-prior",
									rfcMessageId: "prior@example.com",
								},
							],
						}
					: null,
		},
		emailSend: {
			count: async () => 0,
			upsert: async ({ create }: { create: Record<string, unknown> }) => {
				ledger ??= {
					id: "send-1",
					status: "PENDING",
					gmailMessageId: null,
					gmailThreadId: null,
					...create,
				};
				return ledger;
			},
			updateMany: async () => {
				if (ledger?.status !== "PENDING") return { count: 0 };
				ledger.status = "SENDING";
				return { count: 1 };
			},
			update: async ({ data }: { data: Record<string, unknown> }) => {
				if (!ledger) throw new Error("missing ledger");
				Object.assign(ledger, data);
				return ledger;
			},
		},
	} as unknown as Db;

	const gmail = {
		getMessage: async () => ({
			outcome: "ok" as const,
			data: { threadId: "gmail-thread-prior" },
		}),
		sendMessage: async (_token: string, raw: string, threadId?: string) => {
			submissions += 1;
			submittedRaw = raw;
			if (ambiguous) {
				return {
					outcome: "failed" as const,
					reason: "Timed out after 20000ms.",
					retryable: true,
				};
			}
			return {
				outcome: "ok" as const,
				data: { id: "gmail-1", threadId: threadId ?? "thread-1" },
			};
		},
	} as unknown as GmailClient;
	const tokens = {
		accessTokenForSend: async () =>
			connected
				? { outcome: "ok" as const, accessToken: "token" }
				: {
						outcome: "not-connected" as const,
						reason: "The Gmail send scope has not been granted.",
					},
	} as unknown as GoogleTokenService;

	return {
		service: new EmailSendService(db, gmail, tokens),
		submissions: () => submissions,
		raw: () => Buffer.from(submittedRaw, "base64url").toString("utf8"),
	};
}

describe("approved Gmail sends", () => {
	it("submits the approved MIME content and records Gmail identifiers", async () => {
		const test = harness();
		expect(await test.service.send(input)).toEqual({
			outcome: "sent",
			messageId: "gmail-1",
			threadId: "thread-1",
		});
		expect(test.raw()).toContain("To: person@example.com");
		expect(test.raw()).toContain("Subject: =?UTF-8?B?");
		expect(test.submissions()).toBe(1);
	});

	it("returns the recorded result instead of replaying Gmail", async () => {
		const test = harness();
		await test.service.send(input);
		expect(await test.service.send(input)).toEqual({
			outcome: "already-sent",
			messageId: "gmail-1",
			threadId: "thread-1",
		});
		expect(test.submissions()).toBe(1);
	});

	it("fails closed before Gmail when send access is missing", async () => {
		const test = harness(false);
		expect(await test.service.send(input)).toEqual({
			outcome: "needs-reconnect",
			reason: "The Gmail send scope has not been granted.",
		});
		expect(test.submissions()).toBe(0);
	});

	it("anchors an approved reply to the existing Gmail thread", async () => {
		const test = harness(true, true);
		expect(
			await test.service.send({ ...input, crmThreadId: "crm-thread-1" }),
		).toMatchObject({ outcome: "sent", threadId: "gmail-thread-prior" });
		expect(test.raw()).toContain("In-Reply-To: <prior@example.com>");
		expect(test.raw()).toContain("References: <prior@example.com>");
	});

	it("never replays an ambiguous Gmail submission", async () => {
		const test = harness(true, false, true);
		expect(await test.service.send(input)).toMatchObject({
			outcome: "in-progress",
		});
		expect(await test.service.send(input)).toMatchObject({
			outcome: "in-progress",
		});
		expect(test.submissions()).toBe(1);
	});
});
