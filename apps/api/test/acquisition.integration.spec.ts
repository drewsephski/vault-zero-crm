import { afterEach, describe, expect, it } from "bun:test";
import {
	AcquisitionCandidateStatus,
	AcquisitionFit,
	AcquisitionStage,
	db,
	RecordSource,
} from "@crm/db";
import { AcquisitionService } from "../src/acquisition/acquisition.service";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";

const domains: string[] = [];
const realBridgeSecret = process.env.AGENT_BRIDGE_SECRET;

afterEach(async () => {
	const companies = await db.company.findMany({
		where: { domain: { in: domains } },
		select: { id: true },
	});
	await db.agentTask.deleteMany({
		where: { companyId: { in: companies.map((company) => company.id) } },
	});
	await db.acquisitionCandidate.deleteMany({
		where: { domain: { in: domains } },
	});
	await db.company.deleteMany({ where: { domain: { in: domains } } });
	domains.length = 0;
	if (realBridgeSecret === undefined) delete process.env.AGENT_BRIDGE_SECRET;
	else process.env.AGENT_BRIDGE_SECRET = realBridgeSecret;
});

function companyService() {
	delete process.env.AGENT_BRIDGE_SECRET;
	return new CompaniesService(
		db,
		new AgentTriggerService(db),
		new AgentQueueService(db),
		{ backfill: async () => null } as never,
		{} as never,
		{} as never,
	);
}

function service() {
	return new AcquisitionService(db, companyService());
}

describe("acquisition candidate review", () => {
	it("turns an approved candidate into one researched acquisition target", async () => {
		const domain = `candidate-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Candidate Mechanical",
				domain,
				website: `https://${domain}`,
				rationale:
					"The service mix is relevant to the current acquisition thesis.",
				evidence:
					"The company site names commercial HVAC maintenance services.",
				sourceUrl: `https://${domain}/services`,
			},
		});

		const approved = await service().approveCandidate(
			candidate.id,
			"reviewer-1",
		);
		const company = await db.company.findUniqueOrThrow({
			where: { id: approved.companyId },
			include: { acquisitionTarget: true, discoveryCandidate: true },
		});
		const tasks = await db.agentTask.findMany({
			where: { companyId: company.id, finishedAt: null },
			select: { kind: true },
		});

		expect(approved.created).toBe(true);
		expect(company.source).toBe(RecordSource.DISCOVERY);
		expect(company.acquisitionTarget?.stage).toBe(AcquisitionStage.RESEARCHING);
		expect(company.acquisitionTarget?.fit).toBe(AcquisitionFit.UNKNOWN);
		expect(company.discoveryCandidate?.status).toBe(
			AcquisitionCandidateStatus.APPROVED,
		);
		expect(tasks.map((task) => task.kind).sort()).toEqual([
			"acquisition-refresh",
			"brand",
			"company-details",
		]);

		const approvedAgain = await service().approveCandidate(
			candidate.id,
			"reviewer-1",
		);
		expect(approvedAgain).toEqual({
			candidateId: candidate.id,
			companyId: company.id,
			created: false,
		});
		expect(
			await db.acquisitionCandidate.findUnique({ where: { id: candidate.id } }),
		).toMatchObject({ status: AcquisitionCandidateStatus.APPROVED });
		expect(
			await db.agentTask.count({
				where: { companyId: company.id, finishedAt: null },
			}),
		).toBe(3);
	});

	it("keeps dismissed candidates out of the CRM", async () => {
		const domain = `dismissed-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Dismissed Candidate",
				domain,
				website: `https://${domain}`,
				rationale:
					"The candidate needs a review before it can become a target.",
				evidence:
					"The source confirms that the business and its website exist.",
				sourceUrl: `https://${domain}`,
			},
		});

		await service().dismissCandidate(candidate.id);

		expect(
			await db.acquisitionCandidate.findUnique({ where: { id: candidate.id } }),
		).toMatchObject({ status: AcquisitionCandidateStatus.DISMISSED });
		expect(await db.company.findUnique({ where: { domain } })).toBeNull();
	});

	it("attaches a candidate to an existing company without duplicating it", async () => {
		const domain = `existing-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Existing Company", domain, website: `https://${domain}` },
		});
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Existing Company",
				domain,
				website: `https://${domain}`,
				rationale:
					"The existing company record also matches the acquisition thesis.",
				evidence:
					"The source confirms the operating company and its service focus.",
				sourceUrl: `https://${domain}`,
			},
		});

		const approved = await service().approveCandidate(
			candidate.id,
			"reviewer-1",
		);

		expect(approved).toEqual({
			candidateId: candidate.id,
			companyId: company.id,
			created: false,
		});
		expect(await db.company.count({ where: { domain } })).toBe(1);
		expect(
			await db.acquisitionTarget.findUnique({
				where: { companyId: company.id },
			}),
		).toMatchObject({ stage: AcquisitionStage.RESEARCHING });
		expect(
			await db.agentTask.count({
				where: {
					companyId: company.id,
					kind: "acquisition-refresh",
					finishedAt: null,
				},
			}),
		).toBe(1);
	});

	it("keeps detail refresh separate from acquisition analysis", async () => {
		const domain = `actions-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Action Target", domain, website: `https://${domain}` },
		});
		const companies = companyService();

		await companies.enrich(company.id);

		expect(
			(
				await db.agentTask.findMany({
					where: { companyId: company.id, finishedAt: null },
					select: { kind: true },
				})
			)
				.map((task) => task.kind)
				.sort(),
		).toEqual(["brand", "company-details"]);

		await db.agentTask.deleteMany({ where: { companyId: company.id } });
		await companies.analyzeAcquisition(company.id, "reviewer-1");

		expect(
			await db.agentTask.findMany({
				where: { companyId: company.id, finishedAt: null },
				select: { kind: true },
			}),
		).toEqual([{ kind: "acquisition-refresh" }]);
	});
});
