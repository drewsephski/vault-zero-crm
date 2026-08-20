import { describe, expect, it } from "bun:test";
import { AcquisitionCandidateStatus, db, WorkspaceMode } from "@crm/db";
import { proposeAcquisitionCandidates } from "@crm/db/acquisition-candidates";
import { runInOrganization } from "@crm/db/tenancy";
import { WORKSPACE_ID } from "@crm/db/workspace";

function proposal(domain: string): {
	name: string;
	domain: string;
	website: string;
	rationale: string;
	evidence: string;
	sourceUrl: string;
} {
	return {
		name: "Concurrent Candidate",
		domain,
		website: `https://${domain}`,
		rationale: "Updated rationale long enough for validation rules.",
		evidence: "Updated evidence long enough for validation rules.",
		sourceUrl: `https://${domain}/about`,
	};
}

async function upsertBuyBoxRevision(
	organizationId: string,
	buyBoxRevision: number,
) {
	await runInOrganization(organizationId, () =>
		db.acquisitionProfile.upsert({
			where: { id: organizationId },
			create: {
				id: organizationId,
				mode: WorkspaceMode.ACQUISITION,
				preferredIndustries: ["Services"],
				geographies: [],
				excludedCategories: [],
				buyBoxRevision,
			},
			update: { buyBoxRevision },
		}),
	);
}

describe("proposeAcquisitionCandidates", () => {
	it("revives dismissed candidates when buy box revision advances", async () => {
		const domain = `propose-revive-${crypto.randomUUID()}.test`;
		const candidate = await db.acquisitionCandidate.create({
			data: {
				organizationId: WORKSPACE_ID,
				name: "Propose Revive",
				domain,
				website: `https://${domain}`,
				rationale: "Initial rationale long enough for validation rules.",
				evidence: "Initial evidence long enough for validation rules.",
				sourceUrl: `https://${domain}`,
				status: AcquisitionCandidateStatus.DISMISSED,
				dismissedAt: new Date(),
				dismissedBuyBoxRevision: 0,
			},
		});

		await upsertBuyBoxRevision(WORKSPACE_ID, 1);

		const result = await proposeAcquisitionCandidates(db, WORKSPACE_ID, [
			{
				name: "Propose Revive",
				domain,
				website: `https://${domain}`,
				rationale: "Updated rationale long enough for validation rules.",
				evidence: "Updated evidence long enough for validation rules.",
				sourceUrl: `https://${domain}/about`,
			},
		]);

		expect(result).toMatchObject({ saved: 0, revived: 1, skipped: 0 });

		const row = await db.acquisitionCandidate.findUnique({
			where: { id: candidate.id },
		});
		expect(row?.status).toBe(AcquisitionCandidateStatus.PROPOSED);
		expect(row?.dismissedAt).toBeNull();

		await db.acquisitionCandidate.delete({ where: { id: candidate.id } });
	});

	it("converges concurrent proposals for the same new domain", async () => {
		const domain = `propose-concurrent-new-${crypto.randomUUID()}.test`;
		await upsertBuyBoxRevision(WORKSPACE_ID, 0);

		try {
			const results = await Promise.all(
				Array.from({ length: 12 }, () =>
					proposeAcquisitionCandidates(db, WORKSPACE_ID, [proposal(domain)]),
				),
			);

			expect(results.reduce((total, item) => total + item.saved, 0)).toBe(1);
			expect(results.reduce((total, item) => total + item.revived, 0)).toBe(0);
			expect(results.reduce((total, item) => total + item.skipped, 0)).toBe(11);
			expect(
				await db.acquisitionCandidate.count({
					where: { organizationId: WORKSPACE_ID, domain },
				}),
			).toBe(1);

			const row = await db.acquisitionCandidate.findFirst({
				where: { organizationId: WORKSPACE_ID, domain },
			});
			expect(row?.status).toBe(AcquisitionCandidateStatus.PROPOSED);
		} finally {
			await db.acquisitionCandidate.deleteMany({
				where: { organizationId: WORKSPACE_ID, domain },
			});
		}
	});

	it("creates independent rows for the same domain in different organizations", async () => {
		const domain = `propose-concurrent-org-${crypto.randomUUID()}.test`;
		const organizationIds = [
			`org-a-${crypto.randomUUID()}`,
			`org-b-${crypto.randomUUID()}`,
		];

		for (const organizationId of organizationIds) {
			await db.organization.create({
				data: {
					id: organizationId,
					name: organizationId,
					slug: organizationId,
					createdAt: new Date(),
				},
			});
			await upsertBuyBoxRevision(organizationId, 0);
		}

		try {
			const results = await Promise.all(
				organizationIds.flatMap((organizationId) =>
					Array.from({ length: 6 }, () =>
						runInOrganization(organizationId, () =>
							proposeAcquisitionCandidates(db, organizationId, [
								proposal(domain),
							]),
						),
					),
				),
			);

			expect(results.reduce((total, item) => total + item.saved, 0)).toBe(2);
			for (const organizationId of organizationIds) {
				const rows = await db.$queryRaw<{ id: string }[]>`
					SELECT id
					FROM "acquisitionCandidate"
					WHERE domain = ${domain}
						AND "organizationId" = ${organizationId}
				`;
				expect(rows).toHaveLength(1);
			}
		} finally {
			await db.$executeRaw`
				DELETE FROM "acquisitionCandidate"
				WHERE domain = ${domain}
					AND "organizationId" IN (${organizationIds[0]}, ${organizationIds[1]})
			`;
			await db.acquisitionProfile.deleteMany({
				where: { id: { in: organizationIds } },
			});
			await db.organization.deleteMany({
				where: { id: { in: organizationIds } },
			});
		}
	});

	it("converges concurrent revival after buy box revision advances", async () => {
		const domain = `propose-concurrent-revive-${crypto.randomUUID()}.test`;
		const candidate = await db.acquisitionCandidate.create({
			data: {
				organizationId: WORKSPACE_ID,
				name: "Concurrent Revive",
				domain,
				website: `https://${domain}`,
				rationale: "Initial rationale long enough for validation rules.",
				evidence: "Initial evidence long enough for validation rules.",
				sourceUrl: `https://${domain}`,
				status: AcquisitionCandidateStatus.DISMISSED,
				dismissedAt: new Date(),
				dismissedBuyBoxRevision: 0,
			},
		});

		await upsertBuyBoxRevision(WORKSPACE_ID, 1);

		try {
			const results = await Promise.all(
				Array.from({ length: 12 }, () =>
					proposeAcquisitionCandidates(db, WORKSPACE_ID, [proposal(domain)]),
				),
			);

			expect(results.reduce((total, item) => total + item.revived, 0)).toBe(1);
			expect(results.reduce((total, item) => total + item.saved, 0)).toBe(0);
			expect(results.reduce((total, item) => total + item.skipped, 0)).toBe(11);

			const row = await db.acquisitionCandidate.findUnique({
				where: { id: candidate.id },
			});
			expect(row?.status).toBe(AcquisitionCandidateStatus.PROPOSED);
			expect(row?.dismissedAt).toBeNull();
		} finally {
			await db.acquisitionCandidate.delete({ where: { id: candidate.id } });
		}
	});

	it("keeps dismissed candidates skipped when buy box revision is unchanged", async () => {
		const domain = `propose-unchanged-revision-${crypto.randomUUID()}.test`;
		const candidate = await db.acquisitionCandidate.create({
			data: {
				organizationId: WORKSPACE_ID,
				name: "Still Dismissed",
				domain,
				website: `https://${domain}`,
				rationale: "Initial rationale long enough for validation rules.",
				evidence: "Initial evidence long enough for validation rules.",
				sourceUrl: `https://${domain}`,
				status: AcquisitionCandidateStatus.DISMISSED,
				dismissedAt: new Date(),
				dismissedBuyBoxRevision: 1,
			},
		});

		await upsertBuyBoxRevision(WORKSPACE_ID, 1);

		try {
			const results = await Promise.all(
				Array.from({ length: 6 }, () =>
					proposeAcquisitionCandidates(db, WORKSPACE_ID, [proposal(domain)]),
				),
			);

			expect(results.every((item) => item.saved === 0)).toBe(true);
			expect(results.every((item) => item.revived === 0)).toBe(true);
			expect(results.every((item) => item.skipped === 1)).toBe(true);

			const row = await db.acquisitionCandidate.findUnique({
				where: { id: candidate.id },
			});
			expect(row?.status).toBe(AcquisitionCandidateStatus.DISMISSED);
		} finally {
			await db.acquisitionCandidate.delete({ where: { id: candidate.id } });
		}
	});

	it("skips proposals when the domain already belongs to a company", async () => {
		const domain = `propose-company-skip-${crypto.randomUUID()}.test`;
		const company = await db.company.create({
			data: {
				organizationId: WORKSPACE_ID,
				name: "Existing Company",
				domain,
			},
		});

		await upsertBuyBoxRevision(WORKSPACE_ID, 0);

		try {
			const results = await Promise.all(
				Array.from({ length: 6 }, () =>
					proposeAcquisitionCandidates(db, WORKSPACE_ID, [proposal(domain)]),
				),
			);

			expect(results.every((item) => item.skipped === 1)).toBe(true);
			expect(results.every((item) => item.saved === 0)).toBe(true);
			expect(
				await db.acquisitionCandidate.count({
					where: { organizationId: WORKSPACE_ID, domain },
				}),
			).toBe(0);
		} finally {
			await db.company.delete({ where: { id: company.id } });
		}
	});
});
