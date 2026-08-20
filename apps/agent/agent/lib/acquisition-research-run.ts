import { db, Prisma, type PrismaClient } from "@crm/db";
import type { AcquisitionDossierSnapshot } from "@crm/db/acquisition-research-runs";
import { AcquisitionResearchRunStatus } from "@crm/db/enums";
import type { LeasedTask } from "./tasks";

export async function ensureAcquisitionResearchRun(
	task: LeasedTask,
): Promise<string | null> {
	if (task.kind !== "acquisition-refresh" || !task.companyId) return null;
	const companyId = task.companyId;

	const existing = await db.acquisitionResearchRun.findUnique({
		where: { agentTaskId: task.id },
		select: { id: true },
	});
	if (existing) return existing.id;

	try {
		const created = await db.$transaction(async (tx) => {
			const profile = await tx.acquisitionProfile.findUnique({
				where: { id: task.organizationId },
				select: { buyBoxRevision: true },
			});
			return tx.acquisitionResearchRun.create({
				data: {
					organizationId: task.organizationId,
					companyId,
					kind: task.kind,
					agentTaskId: task.id,
					triggeredById: task.requestedById ?? null,
					status: AcquisitionResearchRunStatus.RUNNING,
					buyBoxRevision: profile?.buyBoxRevision ?? null,
				},
				select: { id: true },
			});
		});
		return created.id;
	} catch (error) {
		if (!isUniqueConflict(error)) throw error;

		const retry = await db.acquisitionResearchRun.findUnique({
			where: { agentTaskId: task.id },
			select: { id: true },
		});
		return retry?.id ?? null;
	}
}

export async function noteAcquisitionResearchSession(
	taskId: string,
	sessionId: string,
): Promise<void> {
	await db.acquisitionResearchRun.updateMany({
		where: {
			agentTaskId: taskId,
			status: AcquisitionResearchRunStatus.RUNNING,
		},
		data: { sessionId },
	});
}

export async function succeedAcquisitionResearchRun(
	input: {
		sessionId: string;
		companyId: string;
		snapshot: AcquisitionDossierSnapshot;
	},
	client: ResearchRunClient = db,
): Promise<boolean> {
	const run = await acquisitionResearchRunProvenance(input, client);
	if (!run) return false;

	const now = new Date();
	const result = await client.acquisitionResearchRun.updateMany({
		where: {
			id: run.id,
			status: AcquisitionResearchRunStatus.RUNNING,
		},
		data: {
			status: AcquisitionResearchRunStatus.SUCCEEDED,
			finishedAt: now,
			dossierSnapshot: input.snapshot,
			outcome: null,
		},
	});
	if (result.count !== 1) {
		throw new Error("Could not finalize the running acquisition research run.");
	}
	return true;
}

export async function acquisitionResearchRunProvenance(
	input: { sessionId: string; companyId: string },
	client: ResearchRunClient = db,
): Promise<{ id: string; buyBoxRevision: number | null } | null> {
	const task = await client.agentTask.findFirst({
		where: {
			sessionId: input.sessionId,
			companyId: input.companyId,
			kind: "acquisition-refresh",
		},
		orderBy: { createdAt: "desc" },
		select: { id: true },
	});
	if (!task) return null;

	return client.acquisitionResearchRun.findFirst({
		where: {
			agentTaskId: task.id,
			status: AcquisitionResearchRunStatus.RUNNING,
		},
		select: { id: true, buyBoxRevision: true },
	});
}

type ResearchRunClient = PrismaClient | Prisma.TransactionClient;

export async function failAcquisitionResearchRun(
	agentTaskId: string,
	outcome: string,
	client: ResearchRunClient = db,
): Promise<void> {
	const now = new Date();
	await client.acquisitionResearchRun.updateMany({
		where: {
			agentTaskId,
			status: AcquisitionResearchRunStatus.RUNNING,
		},
		data: {
			status: AcquisitionResearchRunStatus.FAILED,
			finishedAt: now,
			outcome: outcome.slice(0, 500),
		},
	});
}

export async function finalizeAcquisitionResearchRunOnTaskComplete(
	agentTaskId: string,
	client: ResearchRunClient = db,
): Promise<void> {
	await failAcquisitionResearchRun(
		agentTaskId,
		"Research finished without updating the dossier.",
		client,
	);
}

function isUniqueConflict(
	error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}
