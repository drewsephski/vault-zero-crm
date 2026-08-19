import { describe, expect, it } from "bun:test";
import {
	AcquisitionCandidateStatus,
	db,
	WorkspaceMode,
} from "@crm/db";
import { proposeAcquisitionCandidates } from "@crm/db/acquisition-candidates";
import { WORKSPACE_ID } from "@crm/db/workspace";

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

		await db.acquisitionProfile.upsert({
			where: { id: WORKSPACE_ID },
			create: {
				id: WORKSPACE_ID,
				mode: WorkspaceMode.ACQUISITION,
				preferredIndustries: ["Services"],
				geographies: [],
				excludedCategories: [],
				buyBoxRevision: 1,
			},
			update: { buyBoxRevision: 1 },
		});

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
});
