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

	it("requires evidence for every acquisition conclusion", () => {
		const dossier = {
			companyId: "company-1",
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
