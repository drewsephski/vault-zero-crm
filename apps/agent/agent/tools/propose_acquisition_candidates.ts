import { db, getOrganizationId, WorkspaceMode } from "@crm/db";
import { isAcquisitionEvidenceUrl } from "@crm/db/acquisition";
import { proposeAcquisitionCandidates } from "@crm/db/acquisition-candidates";
import { defineTool } from "../lib/tool";
import { z } from "zod";
import { normalizeDomain } from "../lib/record-writes";

const candidate = z.object({
	name: z.string().trim().min(1).max(160),
	domain: z.string().trim().min(1).max(255),
	rationale: z.string().trim().min(20).max(700),
	evidence: z.string().trim().min(10).max(700),
	sourceUrl: z.url().refine(isAcquisitionEvidenceUrl),
	sourceTitle: z.string().trim().max(200).nullable().default(null),
});

export default defineTool({
	description:
		"Save a bounded set of evidence-backed acquisition candidates for human review. Use only after web research confirms each company's real website. This does not create CRM companies, and dismissed or existing domains stay out.",
	inputSchema: z.object({
		candidates: z.array(candidate).min(1).max(10),
	}),
	async execute({ candidates }, ctx) {
		const organizationId = getOrganizationId();
		if (!organizationId) {
			return {
				saved: 0,
				reason: "This session is not attached to a workspace.",
			};
		}

		const profile = await db.acquisitionProfile.findUnique({
			where: { id: organizationId },
			select: { mode: true },
		});
		if (profile?.mode !== WorkspaceMode.ACQUISITION) {
			return {
				saved: 0,
				reason: "Acquisition mode is not enabled for this workspace.",
			};
		}

		const normalized = candidates.flatMap((item) => {
			const domain = normalizeDomain(item.domain);
			if (!domain) return [];
			return [
				{
					...item,
					domain,
					website: `https://${domain}`,
					sourceSessionId: ctx.session.id,
				},
			];
		});

		const { saved, revived, skipped } = await proposeAcquisitionCandidates(
			db,
			organizationId,
			normalized,
		);

		return {
			saved: saved + revived,
			revived,
			skipped,
		};
	},
});
