import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import {
	AcquisitionCandidateStatus,
	AcquisitionFit,
	AcquisitionStage,
	db,
	EnrichmentStatus,
	RecordSource,
	WorkspaceMode,
} from "@crm/db";
import type { AcquisitionCriterionAssessment } from "@crm/db/acquisition";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { AcquisitionService } from "../src/acquisition/acquisition.service";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";

const domains: string[] = [];
const companyIds: string[] = [];
const realBridgeSecret = process.env.AGENT_BRIDGE_SECRET;
let originalFocus: {
	mode: WorkspaceMode;
	preferredIndustries: string[];
	geographies: string[];
} | null;

beforeAll(async () => {
	originalFocus = await db.acquisitionProfile.findUnique({
		where: { id: WORKSPACE_ID },
		select: {
			mode: true,
			preferredIndustries: true,
			geographies: true,
		},
	});
});

beforeEach(async () => {
	await db.acquisitionProfile.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			mode: WorkspaceMode.ACQUISITION,
			preferredIndustries: ["Industrial services"],
			geographies: [],
			excludedCategories: [],
		},
		update: {
			mode: WorkspaceMode.ACQUISITION,
			preferredIndustries: ["Industrial services"],
			geographies: [],
		},
	});
});

afterEach(async () => {
	const companies = await db.company.findMany({
		where: {
			OR: [{ id: { in: companyIds } }, { domain: { in: domains } }],
		},
		select: { id: true },
	});
	await db.agentTask.deleteMany({
		where: { companyId: { in: companies.map((company) => company.id) } },
	});
	await db.acquisitionCandidate.deleteMany({
		where: { domain: { in: domains } },
	});
	await db.company.deleteMany({
		where: { id: { in: companies.map((company) => company.id) } },
	});
	domains.length = 0;
	companyIds.length = 0;
	if (realBridgeSecret === undefined) delete process.env.AGENT_BRIDGE_SECRET;
	else process.env.AGENT_BRIDGE_SECRET = realBridgeSecret;
});

afterAll(async () => {
	if (originalFocus) {
		await db.acquisitionProfile.update({
			where: { id: WORKSPACE_ID },
			data: originalFocus,
		});
	} else {
		await db.acquisitionProfile.deleteMany({ where: { id: WORKSPACE_ID } });
	}
});

function companyService() {
	delete process.env.AGENT_BRIDGE_SECRET;
	return new CompaniesService(
		db,
		new AgentTriggerService(db),
		new AgentQueueService(db),
		{ backfill: async () => null } as never,
		{} as never,
		{ reportingCurrency: async () => "USD" } as never,
	);
}

function service(agent = new AgentTriggerService(db)) {
	return new AcquisitionService(db, companyService(), agent);
}

const dossierACriteria: AcquisitionCriterionAssessment[] = [
	{
		id: "industry",
		result: "MATCH",
		explanation: "The company operates in the preferred industry.",
		blocksQualification: false,
		evidence: [
			{
				label: "Company services",
				url: "https://dossier.example.test/services",
			},
		],
	},
	{
		id: "revenue",
		result: "UNKNOWN",
		explanation: "No reliable source states annual company revenue.",
		blocksQualification: true,
		evidence: [],
	},
];

describe("acquisition dossier read model", () => {
	it("reports acquisition task state without replacing the persisted dossier", async () => {
		const domain = `dossier-state-${crypto.randomUUID()}.test`;
		const timestampA = new Date("2026-08-01T12:00:00.000Z");
		domains.push(domain);
		const company = await db.company.create({
			data: {
				name: "Dossier State Target",
				domain,
				enrichmentStatus: EnrichmentStatus.COMPLETE,
				acquisitionTarget: {
					create: {
						fit: AcquisitionFit.POTENTIAL,
						summary: "Dossier A remains authoritative during later work.",
						strengths: [
							{
								summary: "The prior research found a supported strength.",
								evidence: [
									{
										label: "Prior strength source",
										url: "https://dossier.example.test/strength",
									},
								],
							},
						],
						concerns: [],
						criteria: dossierACriteria,
						missingInformation: ["Verified annual revenue"],
						recommendedAction: "Request normalized financial statements.",
						sourceUrls: ["https://dossier.example.test/strength"],
						researchedAt: timestampA,
					},
				},
			},
			select: { id: true },
		});
		companyIds.push(company.id);
		const companies = companyService();
		const dossierA = (await companies.byId(company.id)).acquisitionTarget;
		const now = new Date();
		const states = [
			{
				name: "queued",
				data: {
					dueAt: new Date(now.getTime() - 60_000),
					leasedUntil: new Date(now.getTime() + 60_000),
				},
				expected: { status: "queued", error: null },
			},
			{
				name: "running",
				data: {
					dueAt: new Date(now.getTime() - 60_000),
					startedAt: now,
				},
				expected: { status: "running", error: null },
			},
			{
				name: "retrying",
				data: {
					dueAt: new Date(now.getTime() - 60_000),
					startedAt: now,
					outcome: "retrying: provider timeout",
					lastError: "provider timeout",
				},
				expected: { status: "retrying", error: "provider timeout" },
			},
			{
				name: "failed",
				data: {
					dueAt: new Date(now.getTime() - 60_000),
					startedAt: now,
					finishedAt: now,
					outcome: "provider timeout",
					lastError: "provider timeout",
				},
				expected: { status: "failed", error: "provider timeout" },
			},
		] as const;

		for (const state of states) {
			await db.agentTask.deleteMany({ where: { companyId: company.id } });
			await db.agentTask.create({
				data: {
					companyId: company.id,
					kind: "acquisition-refresh",
					reason: `${state.name} acquisition research`,
					...state.data,
				},
			});

			const record = await companies.byId(company.id);

			expect(record.acquisitionResearch).toEqual(state.expected);
			expect(record.acquisitionTarget).toEqual(dossierA);
			expect(record.acquisitionTarget?.researchedAt).toBe(
				timestampA.toISOString(),
			);
			expect(record.enrichmentStatus).toBe(EnrichmentStatus.COMPLETE);
			expect(record.queuedKinds).toEqual(
				state.name === "failed" ? [] : ["acquisition-refresh"],
			);
		}

		await db.agentTask.deleteMany({ where: { companyId: company.id } });
		await db.agentTask.create({
			data: {
				companyId: company.id,
				kind: "acquisition-refresh",
				reason: "Successful acquisition research",
				dueAt: new Date(now.getTime() - 60_000),
				startedAt: now,
				finishedAt: now,
				outcome: "completed",
			},
		});

		const completed = await companies.byId(company.id);
		expect(completed.acquisitionResearch).toEqual({
			status: "idle",
			error: null,
		});
		expect(completed.acquisitionTarget).toEqual(dossierA);
	});

	it("parses valid criteria and reduces malformed legacy criteria to an empty list", async () => {
		const domain = `dossier-criteria-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: {
				name: "Dossier Criteria Target",
				domain,
				acquisitionTarget: {
					create: {
						strengths: [],
						concerns: [],
						criteria: dossierACriteria,
						missingInformation: [],
						sourceUrls: [],
					},
				},
			},
			select: { id: true },
		});
		companyIds.push(company.id);
		const companies = companyService();

		expect(
			(await companies.byId(company.id)).acquisitionTarget?.criteria,
		).toEqual(dossierACriteria);

		for (const criteria of [
			[{ ...dossierACriteria[0], id: "invented-criterion" }],
			[{ ...dossierACriteria[0], result: "LIKELY" }],
			[{ ...dossierACriteria[0], explanation: " " }],
			[{ ...dossierACriteria[0], blocksQualification: "false" }],
			[
				{
					...dossierACriteria[0],
					evidence: [{ label: "Source", url: "not a URL" }],
				},
			],
			{ legacy: true },
		]) {
			await db.acquisitionTarget.update({
				where: { companyId: company.id },
				data: { criteria },
			});

			expect(
				(await companies.byId(company.id)).acquisitionTarget?.criteria,
			).toEqual([]);
		}
	});
});

describe("acquisition target mutations", () => {
	it("creates a manual company and acquisition target atomically", async () => {
		const domain = `manual-target-${crypto.randomUUID()}.test`;
		domains.push(domain);

		const result = await service().createTarget(
			{ name: "Manual Target", domain },
			"reviewer-1",
		);
		companyIds.push(result.companyId);

		const company = await db.company.findUniqueOrThrow({
			where: { id: result.companyId },
			include: { acquisitionTarget: true },
		});

		expect(result).toMatchObject({
			companyId: company.id,
			created: true,
			targetCreated: true,
			stage: AcquisitionStage.RESEARCHING,
			research: { status: "queued" },
		});
		expect(company).toMatchObject({
			name: "Manual Target",
			domain,
			website: `https://${domain}`,
			source: RecordSource.MANUAL,
			acquisitionTarget: {
				stage: AcquisitionStage.RESEARCHING,
				fit: AcquisitionFit.UNKNOWN,
			},
		});
	});

	it("promotes an existing company without changing any company field", async () => {
		const domain = `preserved-target-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const enrichedAt = new Date("2026-07-01T12:00:00.000Z");
		const company = await db.company.create({
			data: {
				name: "Preserved Target",
				domain,
				website: `https://${domain}/about`,
				description: "A populated company record.",
				logoUrl: `https://${domain}/logo.svg`,
				logoDarkUrl: `https://${domain}/logo-dark.svg`,
				iconUrl: `https://${domain}/icon.svg`,
				iconDarkUrl: `https://${domain}/icon-dark.svg`,
				iconTone: "LIGHT",
				brandColor: "#123456",
				industry: "Industrial services",
				subIndustry: "Field services",
				city: "Tulsa",
				stateCode: "OK",
				country: "United States",
				countryCode: "US",
				phone: "+1 918 555 0100",
				email: `hello@${domain}`,
				linkedinUrl: `https://linkedin.com/company/${domain}`,
				twitterUrl: `https://x.com/${domain.replaceAll(".", "-")}`,
				githubUrl: `https://github.com/${domain.replaceAll(".", "-")}`,
				pricingUrl: `https://${domain}/pricing`,
				careersUrl: `https://${domain}/careers`,
				enrichmentStatus: EnrichmentStatus.COMPLETE,
				enrichedAt,
				enrichmentError: "Historical warning",
				source: RecordSource.IMPORT,
				lastActivityAt: new Date("2026-07-02T12:00:00.000Z"),
			},
		});
		companyIds.push(company.id);
		const before = await db.company.findUniqueOrThrow({
			where: { id: company.id },
		});

		const result = await service().addTarget(company.id, "reviewer-1");
		const after = await db.company.findUniqueOrThrow({
			where: { id: company.id },
		});

		expect(after).toEqual(before);
		expect(result).toMatchObject({
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.RESEARCHING,
			research: { status: "queued" },
		});
	});

	it("creates a discovered target but blocks research without a domain", async () => {
		const company = await db.company.create({
			data: { name: `Domainless ${crypto.randomUUID()}` },
		});
		companyIds.push(company.id);

		const result = await service().addTarget(company.id, "reviewer-1");

		expect(result).toEqual({
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "blocked", blocker: "missing-domain" },
		});
		expect(
			await db.agentTask.count({
				where: {
					companyId: company.id,
					kind: "acquisition-refresh",
					finishedAt: null,
				},
			}),
		).toBe(0);
	});

	it("blocks target research without a focused buy box", async () => {
		const domain = `unfocused-target-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Unfocused Target", domain },
		});
		companyIds.push(company.id);
		await db.acquisitionProfile.update({
			where: { id: WORKSPACE_ID },
			data: { preferredIndustries: [], geographies: [] },
		});

		const result = await service().addTarget(company.id, "reviewer-1");

		expect(result).toEqual({
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "blocked", blocker: "missing-buy-box" },
		});
		expect(
			await db.agentTask.count({
				where: { companyId: company.id, kind: "acquisition-refresh" },
			}),
		).toBe(0);
	});

	it("reports queue failure and leaves the target discovered", async () => {
		const domain = `queue-failure-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Queue Failure", domain },
		});
		companyIds.push(company.id);
		const agent = {
			acquisitionTargetRequested: async () => {
				throw new Error("Queue unavailable.");
			},
		} as unknown as AgentTriggerService;

		const result = await service(agent).addTarget(company.id, "reviewer-1");

		expect(result).toEqual({
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.DISCOVERED,
			research: { status: "failed", blocker: "queue-unavailable" },
		});
	});

	it("converges twenty concurrent promotions on one target and task", async () => {
		const domain = `concurrent-target-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const company = await db.company.create({
			data: { name: "Concurrent Target", domain },
		});
		companyIds.push(company.id);
		const acquisition = service();

		const results = await Promise.all(
			Array.from({ length: 20 }, () =>
				acquisition.addTarget(company.id, "reviewer-1"),
			),
		);

		expect(results.filter((result) => result.targetCreated)).toHaveLength(1);
		expect(
			new Set(
				results.map((result) =>
					result.research.status === "queued"
						? result.research.taskId
						: result.research.status,
				),
			).size,
		).toBe(1);
		expect(
			await db.acquisitionTarget.count({ where: { companyId: company.id } }),
		).toBe(1);
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

	for (const stage of [
		AcquisitionStage.QUALIFIED,
		AcquisitionStage.REJECTED,
		AcquisitionStage.ACQUIRED,
	]) {
		it(`preserves ${stage} when an existing target is promoted again`, async () => {
			const domain = `repeat-${stage.toLowerCase()}-${crypto.randomUUID()}.test`;
			domains.push(domain);
			const company = await db.company.create({
				data: {
					name: `${stage} Target`,
					domain,
					acquisitionTarget: {
						create: {
							stage,
							strengths: [],
							concerns: [],
							missingInformation: [],
							sourceUrls: [],
						},
					},
				},
			});
			companyIds.push(company.id);

			const result = await service().addTarget(company.id, "reviewer-1");

			expect(result).toMatchObject({
				companyId: company.id,
				targetCreated: false,
				stage,
				research: { status: "queued" },
			});
			expect(
				await db.acquisitionTarget.findUniqueOrThrow({
					where: { companyId: company.id },
				}),
			).toMatchObject({ stage });
		});
	}
});

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
		expect(approvedAgain).toMatchObject({
			candidateId: candidate.id,
			companyId: company.id,
			created: false,
			targetCreated: false,
			stage: AcquisitionStage.RESEARCHING,
			research: { status: "queued" },
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

		expect(approved).toMatchObject({
			candidateId: candidate.id,
			companyId: company.id,
			created: false,
			targetCreated: true,
			stage: AcquisitionStage.RESEARCHING,
			research: { status: "queued" },
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

	it("converges concurrent approvals on one company, target, and task", async () => {
		const domain = `concurrent-candidate-${crypto.randomUUID()}.test`;
		domains.push(domain);
		const candidate = await db.acquisitionCandidate.create({
			data: {
				name: "Concurrent Candidate",
				domain,
				website: `https://${domain}`,
				rationale: "The candidate matches the current acquisition focus.",
				evidence: "The source confirms the company and service category.",
				sourceUrl: `https://${domain}/services`,
			},
		});
		const acquisition = service();

		const settled = await Promise.allSettled(
			Array.from({ length: 20 }, () =>
				acquisition.approveCandidate(candidate.id, "reviewer-1"),
			),
		);
		expect(settled.filter((result) => result.status === "rejected")).toEqual(
			[],
		);
		const results = settled.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
		const ids = new Set(results.map((result) => result.companyId));
		const companyId = results[0]?.companyId;
		expect(companyId).toBeString();
		if (!companyId) throw new Error("Concurrent approval returned no company.");
		companyIds.push(companyId);

		expect(ids.size).toBe(1);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(results.filter((result) => result.targetCreated)).toHaveLength(1);
		expect(
			new Set(
				results.map((result) =>
					result.research.status === "queued"
						? result.research.taskId
						: result.research.status,
				),
			).size,
		).toBe(1);
		expect(await db.company.count({ where: { domain } })).toBe(1);
		expect(await db.acquisitionTarget.count({ where: { companyId } })).toBe(1);
		expect(
			await db.agentTask.count({
				where: {
					companyId,
					kind: "acquisition-refresh",
					finishedAt: null,
				},
			}),
		).toBe(1);
		expect(
			await db.acquisitionCandidate.findUniqueOrThrow({
				where: { id: candidate.id },
			}),
		).toMatchObject({
			companyId,
			status: AcquisitionCandidateStatus.APPROVED,
		});
	});

	for (const stage of [
		AcquisitionStage.QUALIFIED,
		AcquisitionStage.REJECTED,
		AcquisitionStage.ACQUIRED,
	]) {
		it(`preserves ${stage} when an approved candidate is retried`, async () => {
			const domain = `approved-${stage.toLowerCase()}-${crypto.randomUUID()}.test`;
			domains.push(domain);
			const company = await db.company.create({
				data: {
					name: `${stage} Approved Candidate`,
					domain,
					source: RecordSource.DISCOVERY,
					acquisitionTarget: {
						create: {
							stage,
							strengths: [],
							concerns: [],
							missingInformation: [],
							sourceUrls: [`https://${domain}`],
						},
					},
				},
			});
			companyIds.push(company.id);
			const candidate = await db.acquisitionCandidate.create({
				data: {
					name: company.name,
					domain,
					website: `https://${domain}`,
					rationale: "The candidate remains linked to its target.",
					evidence: "The source confirms the existing company.",
					sourceUrl: `https://${domain}`,
					status: AcquisitionCandidateStatus.APPROVED,
					companyId: company.id,
				},
			});

			const result = await service().approveCandidate(
				candidate.id,
				"reviewer-1",
			);

			expect(result).toMatchObject({
				candidateId: candidate.id,
				companyId: company.id,
				targetCreated: false,
				stage,
				research: { status: "queued" },
			});
			expect(
				await db.acquisitionTarget.findUniqueOrThrow({
					where: { companyId: company.id },
				}),
			).toMatchObject({ stage });
		});
	}

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

	it("requires a focused buy box before a manual fit analysis", async () => {
		let requested = false;
		const companies = new CompaniesService(
			{
				company: {
					findUnique: async () => ({
						id: "unfocused-target",
						domain: "target.test",
					}),
				},
				acquisitionProfile: {
					findUnique: async () => ({
						mode: WorkspaceMode.ACQUISITION,
						preferredIndustries: [],
						geographies: [],
					}),
				},
			} as never,
			{
				acquisitionTargetRequested: async () => {
					requested = true;
				},
			} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);

		await expect(
			companies.research("unfocused-target", "reviewer-1"),
		).rejects.toThrow("Add at least one preferred industry or geography");
		expect(requested).toBe(false);
	});
});
