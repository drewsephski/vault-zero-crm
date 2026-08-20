import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";
import { requireOrganizationId } from "../lib/tenant";
import { defineTool } from "../lib/tool";

const inputSchema = z.object({
	to: z.array(z.email()).min(1).max(20),
	cc: z.array(z.email()).max(20).default([]),
	subject: z.string().trim().min(1).max(998),
	body: z.string().trim().min(1).max(100_000),
	crmThreadId: z.string().min(1).optional(),
});

export default defineTool({
	description:
		"Send one plain-text Gmail message as the current rep. The approval shows the exact recipients, subject, and complete body. Use crmThreadId only when replying to a CRM email thread. Never use for a batch, campaign, scheduled follow-up, or unattended task.",
	inputSchema,
	approval: sensitiveWrite(
		"Send only the exact message a rep reviews and approves, one message at a time.",
	),
	async execute(input, ctx) {
		const userId = ctx.session.auth.current?.principalId;
		if (!userId || ctx.session.auth.current?.principalType !== "user") {
			return {
				outcome: "failed" as const,
				reason: "An authenticated rep must approve this email.",
			};
		}

		const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
		if (!secret) {
			return {
				outcome: "failed" as const,
				reason: "Agent email is not configured on this deployment.",
			};
		}

		const apiUrl = process.env.API_URL?.trim() || "http://127.0.0.1:3001";
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(JSON.stringify(input)),
		);
		const contentKey = Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
		const idempotencyKey = `${ctx.session.id}:${ctx.session.turn.id}:${contentKey}`;

		try {
			const response = await fetch(new URL("/internal/google/send", apiUrl), {
				method: "POST",
				headers: {
					authorization: `Bearer ${secret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					...input,
					idempotencyKey,
					userId,
					organizationId: requireOrganizationId(ctx.session.auth),
				}),
			});

			if (!response.ok) {
				return {
					outcome: "failed" as const,
					reason: `The CRM email service returned HTTP ${response.status}.`,
				};
			}

			const result = (await response.json()) as Record<string, unknown>;
			return result.outcome === "needs-reconnect"
				? { ...result, reconnectAt: "/settings/connections" }
				: result;
		} catch (error) {
			return {
				outcome: "failed" as const,
				reason:
					error instanceof Error
						? error.message
						: "The CRM email service could not be reached.",
			};
		}
	},
});
