import { AcquisitionCandidateStatus, db, WorkspaceMode } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { normalizeDomain } from "../lib/record-writes";
import { scheduleTask } from "../lib/tasks";

const candidate = z.object({
	name: z.string().trim().min(1).max(160),
	domain: z.string().trim().min(1).max(255),
	rationale: z.string().trim().min(20).max(700),
	evidence: z.string().trim().min(10).max(700),
	sourceUrl: z.url(),
	sourceTitle: z.string().trim().max(200).nullable().default(null),
});

export default defineTool({
	description:
		"Save a bounded set of evidence-backed acquisition candidates for human review. Use only after web research confirms each company's real website. This does not create CRM companies, and dismissed or existing domains stay out.",
	inputSchema: z.object({
		candidates: z.array(candidate).min(1).max(20),
	}),
	async execute({ candidates }, ctx) {
		const profile = await db.acquisitionProfile.findUnique({
			where: { id: WORKSPACE_ID },
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
		const unique = [
			...new Map(normalized.map((item) => [item.domain, item])).values(),
		];
		const domains = unique.map((item) => item.domain);
		const [companies, existingCandidates] = await Promise.all([
			db.company.findMany({
				where: { domain: { in: domains } },
				select: { domain: true },
			}),
			db.acquisitionCandidate.findMany({
				where: { domain: { in: domains } },
				select: { domain: true, status: true },
			}),
		]);
		const blocked = new Set([
			...companies.flatMap((item) => (item.domain ? [item.domain] : [])),
			...existingCandidates.map((item) => item.domain),
		]);
		const fresh = unique.filter((item) => !blocked.has(item.domain));

		if (fresh.length > 0) {
			await db.acquisitionCandidate.createMany({
				data: fresh.map((item) => ({
					...item,
					status: AcquisitionCandidateStatus.PROPOSED,
				})),
				skipDuplicates: true,
			});
		}

		await scheduleTask({
			kind: "acquisition-discovery",
			reason: "Weekly buy-box discovery refresh",
			dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			priority: PRIORITY.acquisitionDiscovery,
		});

		return {
			saved: fresh.length,
			skipped: candidates.length - fresh.length,
			nextRefreshInDays: 7,
		};
	},
});
