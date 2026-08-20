import { db, EnrichmentStatus, Prisma } from "@crm/db";
import { runInOrganization } from "@crm/db/tenancy";
import {
	ensureAcquisitionResearchRun,
	noteAcquisitionResearchSession,
} from "./acquisition-research-run";
import { APP_AUTH, type AppAuth } from "./app-auth";
import { brandOutcome, runBrand } from "./brand";
import { markRunning, settle } from "./enrichment";
import { collapsing, runLimited } from "./pool";
import { runPortrait } from "./portrait";
import {
	claimDue,
	completeTask,
	DIRECT_KINDS,
	type LeasedTask,
	noteSession,
	retireExhausted,
	type TaskSubject,
} from "./tasks";

export const VISIBLE_BATCH = 60;
export const VISIBLE_CONCURRENCY = 6;
export const VISIBLE_LEASE_MS = 2 * 60_000;

export const RESEARCH_BATCH = 12;
export const RESEARCH_LEASE_MS = 30 * 60_000;

export function researchSlots(active: number): number {
	return Math.max(0, RESEARCH_BATCH - active);
}

export async function retireAbandoned(): Promise<void> {
	let abandoned: TaskSubject[] = [];

	try {
		abandoned = await retireExhausted();
	} catch {
		return;
	}

	for (const task of abandoned) {
		await settle(
			task,
			EnrichmentStatus.FAILED,
			"Research was attempted several times and never completed.",
		).catch(() => {});
	}
}

export async function runVisibleLane(): Promise<number> {
	let handled = 0;

	while (handled < VISIBLE_BATCH) {
		const tasks = await claimDue(
			Math.min(VISIBLE_CONCURRENCY, VISIBLE_BATCH - handled),
			{ only: DIRECT_KINDS },
			VISIBLE_LEASE_MS,
		);

		if (tasks.length === 0) break;

		await runLimited(VISIBLE_CONCURRENCY, tasks, (task) =>
			runInOrganization(task.organizationId, () => runDirect(task)),
		);
		handled += tasks.length;
	}

	return handled;
}

async function runDirect(task: LeasedTask): Promise<void> {
	try {
		if (task.kind === "brand" && task.companyId) {
			const result = await runBrand({ companyId: task.companyId });
			if (result.retryable) return;

			await completeTask(task.id, brandOutcome(result));
			return;
		}

		if (task.kind === "portrait" && task.contactId) {
			const portrait = await runPortrait({
				contactId: task.contactId,
				spend: () => ({ ok: true }),
			});

			await completeTask(
				task.id,
				portrait.stored
					? `Picture stored from ${portrait.source}.`
					: (portrait.reason ?? "No picture found."),
			);
			return;
		}

		await completeTask(task.id, "The record this names is gone.");
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await settle(task, EnrichmentStatus.FAILED, reason).catch(() => {});
	}
}

export async function runResearchLane(
	start: (task: LeasedTask) => Promise<{ id: string }>,
): Promise<number> {
	const [{ count: active } = { count: 0 }] = await db.$queryRaw<
		Array<{ count: number }>
	>`
		SELECT count(*)::int AS count
		FROM "agentTask"
		WHERE "finishedAt" IS NULL
			AND "startedAt" IS NOT NULL
			AND "leasedUntil" > now()
			AND kind NOT IN (${Prisma.join(DIRECT_KINDS)})
	`;
	const available = researchSlots(active);
	if (available === 0) return 0;

	const tasks = await claimDue(
		available,
		{ except: DIRECT_KINDS },
		RESEARCH_LEASE_MS,
	);
	if (tasks.length === 0) return 0;

	await Promise.all(
		tasks.map(async (task) => {
			try {
				await runInOrganization(task.organizationId, async () => {
					await markRunning(task);
					if (task.kind === "acquisition-refresh") {
						await ensureAcquisitionResearchRun(task);
					}
					const session = await start(task);
					await noteSession(task.id, session.id);
					if (task.kind === "acquisition-refresh") {
						await noteAcquisitionResearchSession(task.id, session.id);
					}
				});
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				await settle(task, EnrichmentStatus.FAILED, reason).catch(() => {});
			}
		}),
	);

	return tasks.length;
}

export function taskAuth(task: LeasedTask, base: AppAuth = APP_AUTH): AppAuth {
	return {
		...base,
		attributes: {
			taskKind: task.kind,
			reason: task.reason,
			organizationId: task.organizationId,
			...(task.contactId ? { contactId: task.contactId } : {}),
			...(task.companyId ? { companyId: task.companyId } : {}),
		},
	};
}

export const drainAll = collapsing(
	async (start: (task: LeasedTask) => Promise<{ id: string }>) => {
		await retireAbandoned();
		await Promise.all([runVisibleLane(), runResearchLane(start)]);
	},
);

export async function dispatchReceipt(
	taskId: string,
	read: (taskId: string) => Promise<{
		attempts: number;
		finishedAt: Date | null;
	} | null> = (id) =>
		db.agentTask.findUnique({
			where: { id },
			select: { attempts: true, finishedAt: true },
		}),
) {
	const task = await read(taskId);
	return {
		taskId,
		state:
			task && (task.attempts > 0 || task.finishedAt) ? "claimed" : "queued",
	} as const;
}

export async function requestQueueRefill(
	agentUrl: string,
	secret: string,
	request: typeof fetch = fetch,
): Promise<void> {
	const response = await request(new URL("/internal/crm/dispatch", agentUrl), {
		method: "POST",
		headers: { authorization: `Bearer ${secret}` },
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		throw new Error(`Queue refill returned HTTP ${response.status}.`);
	}
}

export function brief(task: LeasedTask): string {
	const again =
		task.attempts > 1
			? `This is attempt ${task.attempts}; the earlier one did not finish. Carry on from what is already in this thread rather than starting again. `
			: "";

	return again + work(task.kind, task.reason);
}

function work(kind: string, reason: string): string {
	switch (kind) {
		case "identify":
			return "Work out who this contact actually is, and record what you find. Read what we already have before spending anything.";
		case "profile":
		case "recheck":
			return "Bring this contact's record up to date: their background, their current role, and anything that has changed since we last looked.";
		case "meeting-prep":
			return "There is a meeting with this person soon. Make sure whoever is taking it opens the record knowing who they are dealing with.";
		case "company-details":
			return "Refresh this company's structured public details: its website, industry, location and company links. Read what the CRM already has, cite the public sources you use, and do not produce an acquisition assessment or overwrite human-entered values.";
		case "company-profile":
			return "Read this company's CRM history and current public information, then write a useful account brief. Structured brand and directory details are refreshed separately. Do not produce an acquisition assessment.";
		case "acquisition-discovery":
			return "Use the saved buy box to discover a small set of real acquisition candidates. Search broadly, verify each company's website, deduplicate against the CRM, and save at most ten candidates for human review. Do not create company records.";
		case "acquisition-refresh":
			return "Refresh this acquisition target's dossier. Read the CRM first, verify what changed from current public sources, preserve unknowns, and write a new evidence-backed fit assessment and recommended next action.";
		case "workspace-profile":
			return "Write the profile of the company you work for, so that every other session knows who we are. Read our own site and keep it short.";
		default:
			return `Handle this: ${reason}`;
	}
}
