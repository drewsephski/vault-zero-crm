import type { Db } from "./client";
import { Prisma } from "./generated/prisma/client";
import { AcquisitionCandidateStatus } from "./generated/prisma/enums";

const BLOCKED_STATUSES = new Set<AcquisitionCandidateStatus>([
	AcquisitionCandidateStatus.PROPOSED,
	AcquisitionCandidateStatus.APPROVED,
	AcquisitionCandidateStatus.DUPLICATE,
]);

export type AcquisitionCandidateProposal = {
	name: string;
	domain: string;
	website: string;
	rationale: string;
	evidence: string;
	sourceUrl: string;
	sourceTitle?: string | null;
	sourceSessionId?: string | null;
};

export type ProposeAcquisitionCandidatesResult = {
	saved: number;
	revived: number;
	skipped: number;
};

type ExistingCandidate = {
	id: string;
	domain: string;
	status: AcquisitionCandidateStatus;
	dismissedBuyBoxRevision: number | null;
};

export async function proposeAcquisitionCandidates(
	db: Db,
	organizationId: string,
	candidates: AcquisitionCandidateProposal[],
): Promise<ProposeAcquisitionCandidatesResult> {
	const unique = [
		...new Map(candidates.map((item) => [item.domain, item])).values(),
	];
	const domains = unique.map((item) => item.domain);

	if (domains.length === 0) {
		return { saved: 0, revived: 0, skipped: candidates.length };
	}

	const [profile, companies, existingCandidates] = await Promise.all([
		db.acquisitionProfile.findUnique({
			where: { id: organizationId },
			select: { buyBoxRevision: true },
		}),
		db.company.findMany({
			where: { organizationId, domain: { in: domains } },
			select: { domain: true },
		}),
		db.acquisitionCandidate.findMany({
			where: { organizationId, domain: { in: domains } },
			select: {
				id: true,
				domain: true,
				status: true,
				dismissedBuyBoxRevision: true,
			},
		}),
	]);

	const companyDomains = new Set(
		companies.flatMap((item) => (item.domain ? [item.domain] : [])),
	);
	const candidateByDomain = new Map(
		existingCandidates.map((item) => [item.domain, item]),
	);
	const buyBoxRevision = profile?.buyBoxRevision ?? 0;

	let saved = 0;
	let revived = 0;
	let skipped = candidates.length - unique.length;

	for (const item of unique) {
		const outcome = await proposeOneCandidate(
			db,
			organizationId,
			item,
			buyBoxRevision,
			companyDomains,
			candidateByDomain.get(item.domain),
		);

		if (outcome === "saved") saved += 1;
		else if (outcome === "revived") revived += 1;
		else skipped += 1;
	}

	return { saved, revived, skipped };
}

async function proposeOneCandidate(
	db: Db,
	organizationId: string,
	item: AcquisitionCandidateProposal,
	buyBoxRevision: number,
	companyDomains: Set<string>,
	existingFromBatch: ExistingCandidate | undefined,
): Promise<"saved" | "revived" | "skipped"> {
	if (companyDomains.has(item.domain)) {
		return "skipped";
	}

	if (existingFromBatch) {
		return resolveExistingCandidate(
			db,
			organizationId,
			item,
			existingFromBatch,
			buyBoxRevision,
		);
	}

	try {
		await db.acquisitionCandidate.create({
			data: {
				...item,
				organizationId,
				status: AcquisitionCandidateStatus.PROPOSED,
			},
		});
		return "saved";
	} catch (error) {
		if (!isUniqueConflict(error)) throw error;
	}

	const existing = await db.acquisitionCandidate.findFirst({
		where: { domain: item.domain },
		select: {
			id: true,
			domain: true,
			status: true,
			dismissedBuyBoxRevision: true,
		},
	});

	if (!existing) {
		throw new Error(
			`Acquisition candidate for ${item.domain} conflicted but was not found.`,
		);
	}

	return resolveExistingCandidate(
		db,
		organizationId,
		item,
		existing,
		buyBoxRevision,
	);
}

async function resolveExistingCandidate(
	db: Db,
	organizationId: string,
	item: AcquisitionCandidateProposal,
	existing: ExistingCandidate,
	buyBoxRevision: number,
): Promise<"revived" | "skipped"> {
	if (BLOCKED_STATUSES.has(existing.status)) {
		return "skipped";
	}

	if (existing.status === AcquisitionCandidateStatus.DISMISSED) {
		const revived = await reviveDismissedCandidate(
			db,
			organizationId,
			item,
			buyBoxRevision,
		);
		return revived ? "revived" : "skipped";
	}

	return "skipped";
}

async function reviveDismissedCandidate(
	db: Db,
	organizationId: string,
	item: AcquisitionCandidateProposal,
	buyBoxRevision: number,
): Promise<boolean> {
	const { count } = await db.acquisitionCandidate.updateMany({
		where: {
			organizationId,
			domain: item.domain,
			status: AcquisitionCandidateStatus.DISMISSED,
			OR: [
				{ dismissedBuyBoxRevision: null },
				{ dismissedBuyBoxRevision: { lt: buyBoxRevision } },
			],
		},
		data: {
			name: item.name,
			website: item.website,
			rationale: item.rationale,
			evidence: item.evidence,
			sourceUrl: item.sourceUrl,
			sourceTitle: item.sourceTitle ?? null,
			sourceSessionId: item.sourceSessionId ?? null,
			status: AcquisitionCandidateStatus.PROPOSED,
			dismissedAt: null,
			dismissedBuyBoxRevision: null,
			dismissedReason: null,
		},
	});

	return count === 1;
}

function isUniqueConflict(
	error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}
