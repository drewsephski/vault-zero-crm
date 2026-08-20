import { EnrichmentStatus } from "@crm/db";
import { defineChannel, POST } from "eve/channels";
import { verifyKey } from "../lib/context-dev";
import { brief, drainAll, taskAuth } from "../lib/dispatch";
import { settle } from "../lib/enrichment";
import { followUpRequestSchema, generateFollowUps } from "../lib/follow-ups";
import { completeTask, failTask } from "../lib/tasks";
import { withTaskOrganizationScope } from "../lib/tenant";
import { authenticateCrmRep } from "./eve";

const TASK_MARKER = "task:";

function authorised(request: Request): boolean {
	const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
	if (!secret) return false;

	return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function taskToken(taskId: string): string {
	return `${TASK_MARKER}${taskId}`;
}

export function taskFromToken(token: string | undefined): string | null {
	if (!token) return null;

	const marker = token.lastIndexOf(TASK_MARKER);
	if (marker === -1) return null;

	const id = token.slice(marker + TASK_MARKER.length);
	return id.length > 0 ? id : null;
}

export default defineChannel({
	routes: [
		POST("/internal/crm/follow-ups", async (request) => {
			if (!(await authenticateCrmRep(request))) {
				return new Response("Unauthorized", { status: 401 });
			}

			const body = await request.json().catch(() => null);
			const input = followUpRequestSchema.safeParse(body);
			if (!input.success) {
				return Response.json(
					{ error: "Invalid follow-up context." },
					{ status: 400 },
				);
			}

			try {
				return Response.json(await generateFollowUps(input.data));
			} catch (error) {
				console.error(
					"[follow-ups] generation failed",
					error instanceof Error ? error.message : String(error),
				);
				return Response.json(
					{ error: "Follow-up prompts are unavailable." },
					{ status: 503 },
				);
			}
		}),

		POST("/internal/crm/dispatch", async (request, { send, waitUntil }) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			waitUntil(
				drainAll((task) =>
					send(brief(task), {
						auth: taskAuth(task),
						continuationToken: taskToken(task.id),
					}),
				),
			);

			return new Response(null, { status: 202 });
		}),

		POST("/internal/crm/verify-key", async (request) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			const body = (await request.json().catch(() => null)) as {
				apiKey?: unknown;
			} | null;

			const apiKey =
				typeof body?.apiKey === "string" ? body.apiKey.trim() : null;

			if (!apiKey) {
				return Response.json(
					{ outcome: "invalid", reason: "No API key was sent." },
					{ status: 400 },
				);
			}

			return Response.json(await verifyKey(apiKey));
		}),
	],

	events: {
		async "input.requested"(_data, channel) {
			const taskId = taskFromToken(channel.continuationToken);
			if (!taskId) return;

			await withTaskOrganizationScope(taskId, async () => {
				const subject = await completeTask(
					taskId,
					"Research paused because it needs a rep's answer.",
					undefined,
					{ skipResearchRunFinalization: true },
				);
				if (subject) {
					await settle(
						subject,
						EnrichmentStatus.FAILED,
						"Research needs a rep's answer before it can continue.",
					);
				}
			});
		},

		async "session.waiting"(_data, channel) {
			const taskId = taskFromToken(channel.continuationToken);
			if (!taskId) return;

			await withTaskOrganizationScope(taskId, async () => {
				const subject = await completeTask(taskId, "ran");
				if (subject) await settle(subject, EnrichmentStatus.COMPLETE);
			});
		},

		async "turn.failed"(data, channel) {
			const taskId = taskFromToken(channel.continuationToken);
			if (!taskId) return;

			const reason =
				typeof data === "object" && data && "error" in data
					? String((data as { error: unknown }).error)
					: "The research turn failed.";

			await withTaskOrganizationScope(taskId, async () => {
				const result = await failTask(taskId, reason);
				if (!result) return;

				await settle(
					result.subject,
					result.completed
						? EnrichmentStatus.COMPLETE
						: result.retrying
							? EnrichmentStatus.PENDING
							: EnrichmentStatus.FAILED,
					result.completed
						? "Dossier refreshed"
						: result.retrying
							? "Research failed; retrying shortly."
							: reason,
				);
			});
		},
	},

	async receive(input, { send }) {
		const taskId =
			typeof input.target?.taskId === "string" ? input.target.taskId : null;

		return send(input.message, {
			auth: input.auth,
			continuationToken: taskId
				? taskToken(taskId)
				: `crm:adhoc:${crypto.randomUUID()}`,
		});
	},
});
