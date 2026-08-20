import { db, getOrganizationId, Prisma, type PrismaClient } from "@crm/db";
import type { AcquisitionDossierSnapshot } from "@crm/db/acquisition-research-runs";
import { parseResearchTriggeredById } from "@crm/db/acquisition-research-runs";
import { AcquisitionResearchRunStatus } from "@crm/db/enums";
import type { LeasedTask } from "./tasks";

export async function ensureAcquisitionResearchRun(
	task: LeasedTask,
): Promise<string | null> {
	if (task.kind !== "acquisition-refresh" || !task.companyId) return null;

	const existing = await db.acquisitionResearchRun.findUnique({
		where: { agentTaskId: task.id },
		select: { id: true },
	});
	if (existing) return existing.id;

	try {
		const created = await db.acquisitionResearchRun.create({
			data: {
				organizationId: getOrganizationId() ?? "workspace",
				companyId: task.companyId,
				kind: task.kind,
				agentTaskId: task.id,
				triggeredById: parseResearchTriggeredById(task.reason),
				status: AcquisitionResearchRunStatus.RUNNING,
			},
			select: { id: true },
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

export async function succeedAcquisitionResearchRun(input: {
	sessionId: string;
	companyId: string;
	snapshot: AcquisitionDossierSnapshot;
}): Promise<void> {
	const task = await db.agentTask.findFirst({
		where: {
			sessionId: input.sessionId,
			companyId: input.companyId,
			kind: "acquisition-refresh",
		},
		orderBy: { createdAt: "desc" },
		select: { id: true },
	});
	if (!task) return;

	const now = new Date();
	await db.acquisitionResearchRun.updateMany({
		where: {
			agentTaskId: task.id,
			status: AcquisitionResearchRunStatus.RUNNING,
		},
		data: {
			status: AcquisitionResearchRunStatus.SUCCEEDED,
			finishedAt: now,
			dossierSnapshot: input.snapshot,
			outcome: null,
		},
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
