import type { Db } from "./client";
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
			where: { domain: { in: domains } },
			select: { domain: true },
		}),
		db.acquisitionCandidate.findMany({
			where: { domain: { in: domains } },
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
		if (companyDomains.has(item.domain)) {
			skipped += 1;
			continue;
		}

		const existing = candidateByDomain.get(item.domain);
		if (!existing) {
			await db.acquisitionCandidate.create({
				data: {
					...item,
					organizationId,
					status: AcquisitionCandidateStatus.PROPOSED,
				},
			});
			saved += 1;
			continue;
		}

		if (BLOCKED_STATUSES.has(existing.status)) {
			skipped += 1;
			continue;
		}

		if (existing.status === AcquisitionCandidateStatus.DISMISSED) {
			const dismissedRevision = existing.dismissedBuyBoxRevision ?? 0;
			if (buyBoxRevision > dismissedRevision) {
				await db.acquisitionCandidate.update({
					where: { id: existing.id },
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
				revived += 1;
			} else {
				skipped += 1;
			}
			continue;
		}

		skipped += 1;
	}

	return { saved, revived, skipped };
}
