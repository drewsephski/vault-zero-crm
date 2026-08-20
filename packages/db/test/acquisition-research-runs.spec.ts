import { describe, expect, it } from "bun:test";
import {
	parseAcquisitionDossierSnapshot,
	researchRunListSnapshot,
} from "../src/acquisition-research-runs";

const validSnapshot = {
	fit: "STRONG",
	summary: "A supported acquisition fit.",
	criteria: [
		{
			id: "industry",
			result: "MATCH",
			explanation: "The company operates in an included industry.",
			blocksQualification: false,
			evidence: [{ label: "Company site", url: "https://example.com" }],
		},
	],
	strengths: [
		{
			summary: "Recurring demand",
			evidence: [{ label: "Services", url: "https://example.com/services" }],
		},
	],
	concerns: [],
	missingInformation: ["Customer concentration"],
	recommendedAction: "Request financials.",
	recommendedStage: "QUALIFIED",
	sourceUrls: ["https://example.com"],
	researchedAt: "2026-08-20T12:00:00.000Z",
	sourceSessionId: "session-1",
};

describe("acquisition research run snapshots", () => {
	it("rejects an unknown acquisition fit without throwing", () => {
		const snapshot = { ...validSnapshot, fit: "GOOD" };

		expect(parseAcquisitionDossierSnapshot(snapshot)).toBeNull();
		expect(researchRunListSnapshot(snapshot)).toEqual({
			fit: null,
			summary: null,
		});
	});

	it("rejects malformed criterion assessments", () => {
		const snapshot = {
			...validSnapshot,
			criteria: [{ id: "industry", result: "MATCH" }],
		};

		expect(parseAcquisitionDossierSnapshot(snapshot)).toBeNull();
	});

	it("treats a missing legacy recommended stage as no recommendation", () => {
		const { recommendedStage: _, ...legacySnapshot } = validSnapshot;

		expect(parseAcquisitionDossierSnapshot(legacySnapshot)).toMatchObject({
			recommendedStage: null,
		});
	});

	it("rejects invalid evidence structures", () => {
		const snapshot = {
			...validSnapshot,
			strengths: [{ summary: "Recurring demand", evidence: ["source"] }],
		};

		expect(parseAcquisitionDossierSnapshot(snapshot)).toBeNull();
	});
});
