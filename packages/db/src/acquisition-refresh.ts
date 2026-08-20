import { ACTIVE_ACQUISITION_STAGES, isDossierReady } from "./acquisition";
import type { Db } from "./client";
import type { Prisma } from "./generated/prisma/client";

export async function acquisitionRefreshTargetIds(
	database: Db,
	organizationId: string,
	limit: number,
	options: { excludeQueued?: boolean; excludedCompanyIds?: string[] } = {},
): Promise<string[]> {
	if (limit <= 0) return [];

	const profile = await database.acquisitionProfile.findUnique({
		where: { id: organizationId },
	});
	if (!profile || !isDossierReady(profile)) return [];

	const unfinished = options.excludeQueued
		? await database.agentTask.findMany({
				where: {
					organizationId,
					kind: "acquisition-refresh",
					finishedAt: null,
					companyId: { not: null },
				},
				select: { companyId: true },
			})
		: [];
	const excludedCompanyIds = [
		...(options.excludedCompanyIds ?? []),
		...unfinished.flatMap((task) => (task.companyId ? [task.companyId] : [])),
	];
	const baseWhere: Prisma.AcquisitionTargetWhereInput = {
		stage: { in: [...ACTIVE_ACQUISITION_STAGES] },
		company: {
			is: {
				organizationId,
				domain: { not: null },
			},
		},
		...(excludedCompanyIds.length > 0
			? { companyId: { notIn: excludedCompanyIds } }
			: {}),
	};
	const selected: string[] = [];

	const append = (rows: Array<{ companyId: string }>) => {
		selected.push(...rows.map((row) => row.companyId));
	};
	append(
		await database.acquisitionTarget.findMany({
			where: { ...baseWhere, researchedAt: null },
			select: { companyId: true },
			orderBy: { createdAt: "asc" },
			take: limit,
		}),
	);

	if (selected.length < limit) {
		append(
			await database.acquisitionTarget.findMany({
				where: {
					...baseWhere,
					companyId: { notIn: [...excludedCompanyIds, ...selected] },
					researchedAt: { not: null },
					researchedBuyBoxRevision: {
						not: null,
						lt: profile.buyBoxRevision,
					},
				},
				select: { companyId: true },
				orderBy: [{ researchedBuyBoxRevision: "asc" }, { researchedAt: "asc" }],
				take: limit - selected.length,
			}),
		);
	}

	if (selected.length < limit) {
		append(
			await database.acquisitionTarget.findMany({
				where: {
					...baseWhere,
					companyId: { notIn: [...excludedCompanyIds, ...selected] },
					researchedAt: { not: null },
					researchedBuyBoxRevision: null,
				},
				select: { companyId: true },
				orderBy: { researchedAt: "asc" },
				take: limit - selected.length,
			}),
		);
	}

	return selected;
}
