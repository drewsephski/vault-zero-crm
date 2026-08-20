import { createHash } from "node:crypto";
import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { EmailSendInput } from "./email-send.contracts";
import { GmailClient } from "./gmail.client";
import { GoogleTokenService } from "./google-token.service";

type SendOutcome =
	| { outcome: "sent" | "already-sent"; messageId: string; threadId: string }
	| { outcome: "needs-reconnect"; reason: string }
	| { outcome: "in-progress"; reason: string }
	| { outcome: "failed"; reason: string };

@Injectable()
export class EmailSendService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: GoogleTokenService,
	) {}

	async send(input: EmailSendInput): Promise<SendOutcome> {
		const membership = await this.db.member.findUnique({
			where: {
				organizationId_userId: {
					organizationId: input.organizationId,
					userId: input.userId,
				},
			},
			select: { id: true },
		});
		if (!membership)
			return { outcome: "failed", reason: "Workspace access was denied." };

		const thread = input.crmThreadId
			? await this.db.emailThread.findFirst({
					where: {
						id: input.crmThreadId,
						OR: [
							{ contact: { organizationId: input.organizationId } },
							{ company: { organizationId: input.organizationId } },
						],
					},
					select: {
						messages: {
							where: { gmailMessageId: { not: null } },
							orderBy: { sentAt: "desc" },
							take: 1,
							select: { gmailMessageId: true, rfcMessageId: true },
						},
					},
				})
			: null;
		if (input.crmThreadId && !thread) {
			return {
				outcome: "failed",
				reason: "That email thread is not in this workspace.",
			};
		}

		const fingerprint = this.fingerprint(input);
		const rfcMessageId = `${fingerprint}@crm.vaultzero.dev`;
		const ledger = await this.db.emailSend.upsert({
			where: { idempotencyKey: input.idempotencyKey },
			create: {
				idempotencyKey: input.idempotencyKey,
				organizationId: input.organizationId,
				userId: input.userId,
				to: input.to,
				cc: input.cc,
				subject: input.subject,
				body: input.body,
				crmThreadId: input.crmThreadId,
				rfcMessageId,
			},
			update: {},
		});

		if (
			ledger.organizationId !== input.organizationId ||
			ledger.userId !== input.userId ||
			ledger.rfcMessageId !== rfcMessageId
		) {
			return {
				outcome: "failed",
				reason: "The send key was already used for different content.",
			};
		}
		if (
			ledger.status === "SENT" &&
			ledger.gmailMessageId &&
			ledger.gmailThreadId
		) {
			return {
				outcome: "already-sent",
				messageId: ledger.gmailMessageId,
				threadId: ledger.gmailThreadId,
			};
		}
		if (ledger.status !== "PENDING") {
			return {
				outcome: ledger.status === "SENDING" ? "in-progress" : "failed",
				reason:
					ledger.status === "SENDING"
						? "This approved email may already be with Gmail and will not be replayed automatically."
						: (ledger.error ??
							"This send attempt failed and will not be replayed automatically."),
			};
		}

		const recent = await this.db.emailSend.count({
			where: {
				userId: input.userId,
				createdAt: { gte: new Date(Date.now() - 60_000) },
				status: { in: ["SENDING", "SENT"] },
			},
		});
		if (recent >= 10) {
			const reason =
				"No email was sent because the per-minute Gmail safety limit was reached.";
			await this.fail(ledger.id, reason);
			return { outcome: "failed", reason };
		}

		const token = await this.tokens.accessTokenForSend(input.userId);
		if (token.outcome !== "ok") {
			await this.fail(ledger.id, token.reason);
			return { outcome: "needs-reconnect", reason: token.reason };
		}

		const claimed = await this.db.emailSend.updateMany({
			where: { id: ledger.id, status: "PENDING" },
			data: { status: "SENDING", startedAt: new Date(), error: null },
		});
		if (claimed.count !== 1) {
			return {
				outcome: "in-progress",
				reason: "This approved email is already being sent.",
			};
		}

		const latest = thread?.messages[0];
		let gmailThreadId: string | undefined;
		if (latest?.gmailMessageId) {
			const message = await this.gmail.getMessage(
				token.accessToken,
				latest.gmailMessageId,
			);
			if (message.outcome !== "ok" || !message.data.threadId) {
				const reason =
					"The Gmail thread could not be resolved. No email was submitted.";
				await this.fail(ledger.id, reason);
				return { outcome: "failed", reason };
			}
			gmailThreadId = message.data.threadId;
		}

		const raw = this.rawMessage(
			input,
			rfcMessageId,
			latest?.rfcMessageId ?? undefined,
		);
		const result = await this.gmail.sendMessage(
			token.accessToken,
			raw,
			gmailThreadId,
		);
		if (result.outcome !== "ok" || !result.data.id || !result.data.threadId) {
			if (
				result.outcome === "ok" ||
				(result.outcome === "failed" && result.retryable)
			) {
				return {
					outcome: "in-progress",
					reason:
						"Gmail submission has an unknown final state. It will not be replayed automatically; check Sent mail before approving another message.",
				};
			}

			const reason = result.reason;
			await this.fail(ledger.id, reason);
			return result.outcome === "unauthorized"
				? { outcome: "needs-reconnect", reason }
				: { outcome: "failed", reason };
		}

		await this.db.emailSend.update({
			where: { id: ledger.id },
			data: {
				status: "SENT",
				gmailMessageId: result.data.id,
				gmailThreadId: result.data.threadId,
				sentAt: new Date(),
			},
		});

		return {
			outcome: "sent",
			messageId: result.data.id,
			threadId: result.data.threadId,
		};
	}

	private fingerprint(input: EmailSendInput): string {
		return createHash("sha256")
			.update(
				JSON.stringify([
					input.userId,
					input.organizationId,
					input.to,
					input.cc,
					input.subject,
					input.body,
					input.crmThreadId ?? null,
				]),
			)
			.digest("hex");
	}

	private rawMessage(
		input: EmailSendInput,
		messageId: string,
		replyTo?: string,
	): string {
		const headers = [
			`To: ${input.to.join(", ")}`,
			...(input.cc.length > 0 ? [`Cc: ${input.cc.join(", ")}`] : []),
			`Subject: ${this.encodedHeader(input.subject)}`,
			`Message-ID: <${messageId}>`,
			...(replyTo
				? [`In-Reply-To: <${replyTo}>`, `References: <${replyTo}>`]
				: []),
			"MIME-Version: 1.0",
			"Content-Type: text/plain; charset=UTF-8",
			"Content-Transfer-Encoding: base64",
			"",
			Buffer.from(input.body, "utf8")
				.toString("base64")
				.replace(/.{1,76}/g, "$&\r\n")
				.trimEnd(),
		].join("\r\n");

		return Buffer.from(headers, "utf8").toString("base64url");
	}

	private encodedHeader(value: string): string {
		return /^[\x20-\x7E]+$/.test(value)
			? value
			: `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
	}

	private async fail(id: string, reason: string): Promise<void> {
		await this.db.emailSend.update({
			where: { id },
			data: { status: "FAILED", error: reason.slice(0, 1000) },
		});
	}
}
