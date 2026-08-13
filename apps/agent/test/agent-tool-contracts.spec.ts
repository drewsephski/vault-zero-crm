import { describe, expect, it } from "bun:test";
import createContact from "../agent/tools/create_contact";
import getLinkedInProfile from "../agent/tools/get_linkedin_profile";
import proposeAcquisitionCandidates from "../agent/tools/propose_acquisition_candidates";
import readLinkedInProfile from "../agent/tools/read_linkedin_profile";
import writeAcquisitionDossier from "../agent/tools/write_acquisition_dossier";

describe("agent tool contracts", () => {
	it("accepts an unassigned contact creation request", () => {
		const result = createContact.inputSchema.safeParse({
			firstName: "Drew",
			lastName: null,
			email: null,
			phone: null,
			profileUrl: null,
			companyId: null,
			ownerId: null,
		});

		expect(result.success).toBe(true);
	});

	it("fetches LinkedIn work history by default", () => {
		expect(
			readLinkedInProfile.inputSchema.safeParse({
				profile: "drewsepeczi",
			}).data?.includeHistory,
		).toBe(true);
		expect(
			getLinkedInProfile.inputSchema.safeParse({
				slug: "drewsepeczi",
				email: "drew@example.com",
				companyName: "Example",
				companyDomain: "example.com",
			}).data?.includeHistory,
		).toBe(true);
	});

	it("requires real source URLs for discovery candidates", () => {
		const candidate = {
			name: "Example Mechanical",
			domain: "example-mechanical.test",
			rationale:
				"Its service profile appears aligned with the current buy box.",
			evidence: "The company website describes commercial HVAC maintenance.",
			sourceUrl: "not-a-url",
			sourceTitle: "Company website",
		};

		expect(
			proposeAcquisitionCandidates.inputSchema.safeParse({
				candidates: [candidate],
			}).success,
		).toBe(false);
		expect(
			proposeAcquisitionCandidates.inputSchema.safeParse({
				candidates: [
					{ ...candidate, sourceUrl: "https://example-mechanical.test" },
				],
			}).success,
		).toBe(true);
	});

	it("accepts no more than ten discovery candidates", () => {
		const candidate = {
			name: "Example Mechanical",
			domain: "example-mechanical.test",
			rationale:
				"Its service profile appears aligned with the current buy box.",
			evidence: "The company website describes commercial HVAC maintenance.",
			sourceUrl: "https://example-mechanical.test",
			sourceTitle: "Company website",
		};
		const candidates = Array.from({ length: 10 }, (_, index) => ({
			...candidate,
			name: `${candidate.name} ${index}`,
			domain: `example-mechanical-${index}.test`,
			sourceUrl: `https://example-mechanical-${index}.test`,
		}));

		expect(
			proposeAcquisitionCandidates.inputSchema.safeParse({ candidates })
				.success,
		).toBe(true);
		expect(
			proposeAcquisitionCandidates.inputSchema.safeParse({
				candidates: [
					...candidates,
					{
						...candidate,
						name: `${candidate.name} 10`,
						domain: "example-mechanical-10.test",
						sourceUrl: "https://example-mechanical-10.test",
					},
				],
			}).success,
		).toBe(false);
	});

	it("enforces evidence and blocker rules for acquisition criteria", () => {
		const dossier = {
			companyId: "company-1",
			fit: "POTENTIAL",
			summary:
				"The business is a plausible fit, pending confirmation of its economics.",
			strengths: [],
			concerns: [],
			missingInformation: ["Revenue and owner transition preference"],
			recommendedAction: "Confirm ownership and financial scale.",
			recommendedStage: "QUALIFIED",
		};
		const assessment = {
			id: "industry",
			result: "MATCH",
			explanation: "The company operates in a preferred service category.",
			blocksQualification: false,
			evidence: [],
		};

		for (const result of ["MATCH", "PARTIAL", "CONCERN"] as const) {
			expect(
				writeAcquisitionDossier.inputSchema.safeParse({
					...dossier,
					criteria: [{ ...assessment, result }],
				}).success,
			).toBe(false);
		}

		expect(
			writeAcquisitionDossier.inputSchema.safeParse({
				...dossier,
				criteria: [
					{
						...assessment,
						result: "UNKNOWN",
						blocksQualification: true,
					},
				],
			}).success,
		).toBe(true);
		expect(
			writeAcquisitionDossier.inputSchema.safeParse({
				...dossier,
				criteria: [{ ...assessment, blocksQualification: true }],
			}).success,
		).toBe(false);
	});

	it("rejects non-http acquisition criterion evidence", () => {
		const dossier = {
			companyId: "company-1",
			fit: "POTENTIAL",
			summary:
				"The business is a plausible fit, pending confirmation of its economics.",
			strengths: [],
			concerns: [],
			missingInformation: ["Revenue and owner transition preference"],
			recommendedAction: "Confirm ownership and financial scale.",
			recommendedStage: "QUALIFIED",
		};
		const assessment = {
			id: "industry",
			result: "MATCH",
			explanation: "The company operates in a preferred service category.",
			blocksQualification: false,
			evidence: [
				{
					label: "Company service category",
					url: "https://example-mechanical.test/services",
				},
			],
		};

		for (const url of [
			"ftp://example-mechanical.test/services",
			"mailto:source@example.test",
		]) {
			expect(
				writeAcquisitionDossier.inputSchema.safeParse({
					...dossier,
					criteria: [
						{
							...assessment,
							evidence: [{ ...assessment.evidence[0], url }],
						},
					],
				}).success,
			).toBe(false);
		}

		expect(
			writeAcquisitionDossier.inputSchema.safeParse({
				...dossier,
				criteria: [assessment],
			}).success,
		).toBe(true);
	});

	it("requires evidence for every acquisition conclusion", () => {
		const dossier = {
			companyId: "company-1",
			criteria: [],
			fit: "STRONG",
			summary:
				"The business is a plausible fit, pending confirmation of its economics.",
			strengths: [
				{
					summary: "Operates in a preferred service category.",
					evidence: [],
				},
			],
			concerns: [],
			missingInformation: ["Revenue and owner transition preference"],
			recommendedAction: "Confirm ownership and financial scale.",
			recommendedStage: "QUALIFIED",
		};

		expect(writeAcquisitionDossier.inputSchema.safeParse(dossier).success).toBe(
			false,
		);
		expect(
			writeAcquisitionDossier.inputSchema.safeParse({
				...dossier,
				strengths: [
					{
						summary: "Operates in a preferred service category.",
						evidence: [
							{
								label: "Commercial HVAC service offering",
								url: "https://example-mechanical.test/services",
							},
						],
					},
				],
			}).success,
		).toBe(true);
	});
});
