import type { Db } from "@crm/db";
import { PRIORITY, queueAgentTask } from "@crm/db/agent-tasks";
import { Injectable, Logger } from "@nestjs/common";
import { waitUntil } from "@vercel/functions";
import { InjectDatabase } from "../database/database.constants";
import { type Bridge, bridge } from "./bridge";

const POKE_TIMEOUT_MS = 15_000;

type Defer = (promise: Promise<unknown>) => void;

type EnqueueResult = { taskId: string; created: boolean };

export async function requestAgentDispatch(
	agent: Bridge,
	fetcher: typeof fetch = fetch,
): Promise<void> {
	const response = await fetcher(agent.url("/internal/crm/dispatch"), {
		method: "POST",
		headers: { authorization: `Bearer ${agent.secret}` },
		signal: AbortSignal.timeout(POKE_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`Agent dispatch returned HTTP ${response.status}.`);
	}
}

export function keepAgentDispatchAlive(
	dispatch: Promise<unknown>,
	options: { isVercel?: boolean; defer?: Defer } = {},
): void {
	const isVercel = options.isVercel ?? Boolean(process.env.VERCEL);
	if (!isVercel) {
		void dispatch;
		return;
	}

	(options.defer ?? waitUntil)(dispatch);
}

@Injectable()
export class AgentTriggerService {
	private readonly logger = new Logger(AgentTriggerService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async companyCreated(
		companyId: string,
		reason = "New company",
	): Promise<void> {
		await this.enqueue({
			companyId,
			kind: "brand",
			reason,
			priority: PRIORITY.brand,
			budget: 2,
		});

		await this.enqueue({
			companyId,
			kind: "company-details",
			reason,
			priority: PRIORITY.companyDetails,
			budget: 4,
		});
	}

	async companyDetailsRequested(
		companyId: string,
		reason: string,
	): Promise<void> {
		await this.enqueue({
			companyId,
			kind: "brand",
			reason,
			priority: PRIORITY.brand,
			budget: 2,
		});

		await this.enqueue({
			companyId,
			kind: "company-details",
			reason,
			priority: PRIORITY.requested,
			budget: 8,
		});
	}

	async companyResearchRequested(
		companyId: string,
		reason: string,
	): Promise<EnqueueResult> {
		return this.enqueue({
			companyId,
			kind: "company-profile",
			reason,
			priority: PRIORITY.requested,
			budget: 8,
		});
	}

	async acquisitionTargetRequested(
		companyId: string,
		reason: string,
	): Promise<EnqueueResult> {
		return this.enqueue({
			companyId,
			kind: "acquisition-refresh",
			reason,
			priority: PRIORITY.requested,
			budget: 12,
		});
	}

	async workspaceChanged(
		website: string,
		reason: string,
	): Promise<EnqueueResult> {
		return this.enqueue({
			kind: "workspace-profile",
			reason: `${reason} (${website})`,
			priority: PRIORITY.workspace,
			budget: 4,
		});
	}

	async acquisitionProfileChanged(reason: string): Promise<EnqueueResult> {
		return this.enqueue({
			kind: "acquisition-discovery",
			reason,
			priority: PRIORITY.acquisitionDiscovery,
			budget: 12,
		});
	}

	async contactCreated(
		contactId: string,
		reason: string,
	): Promise<EnqueueResult> {
		return this.enqueue({
			contactId,
			kind: "identify",
			reason,
			priority: PRIORITY.identify,
			budget: 4,
		});
	}

	async meetingSoon(contactId: string, when: Date): Promise<EnqueueResult> {
		return this.enqueue({
			contactId,
			kind: "meeting-prep",
			reason: `Meeting on ${when.toDateString()} with someone we know nothing about`,
			priority: PRIORITY.meeting,
			budget: 10,
		});
	}

	async backfill(input: {
		kind: string;
		reason: string;
		contactIds?: string[];
		companyIds?: string[];
		budget?: number;
		priority?: number;
	}): Promise<{ queued: number; alreadyQueued: number }> {
		const ids = [...new Set(input.contactIds ?? input.companyIds ?? [])];
		if (ids.length === 0) return { queued: 0, alreadyQueued: 0 };

		try {
			const dueAt = new Date();
			const results = await Promise.all(
				ids.map((id) =>
					queueAgentTask(this.db, {
						contactId: input.contactIds ? id : undefined,
						companyId: input.companyIds ? id : undefined,
						kind: input.kind,
						reason: input.reason,
						priority: input.priority ?? PRIORITY.sweep,
						budget: input.budget ?? 4,
						dueAt,
					}),
				),
			);
			const queued = results.filter((result) => result.created).length;

			this.logger.log({
				message: "Backfill queued",
				kind: input.kind,
				queued,
				alreadyQueued: ids.length - queued,
			});

			if (results.some((result) => result.created || result.advanced))
				this.poke();

			return {
				queued,
				alreadyQueued: ids.length - queued,
			};
		} catch (error) {
			this.logger.error(
				{ message: "Could not queue backfill", kind: input.kind },
				error instanceof Error ? error.stack : String(error),
			);
			throw error;
		}
	}

	private async enqueue(task: {
		contactId?: string;
		companyId?: string;
		kind: string;
		reason: string;
		priority: number;
		budget: number;
	}): Promise<EnqueueResult> {
		const now = new Date();

		try {
			const result = await queueAgentTask(this.db, {
				...task,
				dueAt: now,
			});

			if (result.created) {
				this.logger.log({
					message: "Agent task queued",
					kind: task.kind,
					contactId: task.contactId,
					companyId: task.companyId,
				});
			}

			if (result.created || result.advanced) this.poke();
			return { taskId: result.taskId, created: result.created };
		} catch (error) {
			this.logger.error(
				{ message: "Could not queue agent task", kind: task.kind },
				error instanceof Error ? error.stack : String(error),
			);
			throw error;
		}
	}

	private poke(): void {
		const agent = bridge();
		if (!agent) return;

		const missed = (error: unknown) => {
			this.logger.warn({
				message: "Agent poke did not land; the cron will pick this up",
				reason: error instanceof Error ? error.message : String(error),
			});
		};

		const dispatch = requestAgentDispatch(agent)
			.then(() => {
				this.logger.debug({ message: "Agent poke landed" });
			})
			.catch(missed);

		try {
			keepAgentDispatchAlive(dispatch);
		} catch (error) {
			this.logger.warn({
				message:
					"Agent poke could not join the request lifecycle; the cron will pick this up",
				reason: error instanceof Error ? error.message : String(error),
			});
			void dispatch;
		}
	}
}
