import { describe, expect, it } from "bun:test";
import { companiesSearchParams } from "../app/(app)/[slug]/companies/companies-search-params";
import {
	acquisitionCriterionLabel,
	acquisitionResearchActivity,
	acquisitionTargetCreateSubmission,
	criterionGroups,
	defaultCompanyTab,
	engagementAmountComparisonNote,
	legacyResearchRevisionNotice,
	researchHistoryPollInterval,
	researchSnapshotUnavailable,
	safeAcquisitionCandidateSource,
	safeAcquisitionEvidence,
	targetResearchCopy,
} from "../lib/acquisition";

describe("acquisition presentation", () => {
	it("normalizes the primary target view to active for the API", () => {
		expect(companiesSearchParams.defaultInput().targetView).toBe("active");
		expect(
			companiesSearchParams.toInput({
				...companiesSearchParams.defaultInput(),
				targetView: "all",
			}),
		).toMatchObject({ targetView: "active" });
	});

	it("keeps URL target views aligned with the visible control", async () => {
		for (const [raw, control, api] of [
			[undefined, "all", "active"],
			["all", "all", "active"],
			["rejected", "rejected", "rejected"],
			["acquired", "acquired", "acquired"],
			["history", "history", "history"],
			["active", "all", "active"],
			["invented", "all", "active"],
		] as const) {
			const values = await companiesSearchParams.load({ targetView: raw });

			expect(values.targetView).toBe(control);
			expect(companiesSearchParams.toInput(values).targetView).toBe(api);
		}
	});

	it("uses the decision-ready buy-box labels", () => {
		expect(acquisitionCriterionLabel("revenue")).toBe("Annual revenue");
		expect(acquisitionCriterionLabel("ebitda")).toBe("EBITDA or SDE");
		expect(acquisitionCriterionLabel("customer-concentration")).toBe(
			"Maximum customer concentration",
		);
		expect(acquisitionCriterionLabel("financing")).toBe(
			"Financing assumptions",
		);
	});

	it("keeps unsafe evidence out of presentation links", () => {
		expect(
			safeAcquisitionEvidence([
				{ label: "Company profile", url: "https://target.test/profile" },
				{ label: "Unsafe", url: "javascript:alert(document.domain)" },
				{ label: "Local file", url: "file:///etc/passwd" },
			]),
		).toEqual([
			{ label: "Company profile", url: "https://target.test/profile" },
		]);
	});

	it("rejects unsafe legacy candidate source links", () => {
		expect(safeAcquisitionCandidateSource("https://target.test/profile")).toBe(
			"https://target.test/profile",
		);
		expect(
			safeAcquisitionCandidateSource("javascript:alert(document.domain)"),
		).toBeNull();
	});

	it("reuses the same target creation key when a submission is retried", () => {
		const fields = {
			name: "Atlas Services",
			domain: undefined,
			ownerId: null,
		};
		const idempotencyKey = "123e4567-e89b-42d3-a456-426614174000";

		expect(acquisitionTargetCreateSubmission(fields, idempotencyKey)).toEqual(
			acquisitionTargetCreateSubmission(fields, idempotencyKey),
		);
		expect(
			acquisitionTargetCreateSubmission(fields, idempotencyKey).idempotencyKey,
		).toBe(idempotencyKey);
	});

	it("defaults real targets to Acquisition without changing generic companies", () => {
		expect(
			defaultCompanyTab(
				{ acquisitionTarget: { companyId: "company-1" } },
				true,
			),
		).toBe("acquisition");
		expect(defaultCompanyTab({ acquisitionTarget: null }, true)).toBe(
			"overview",
		);
		expect(
			defaultCompanyTab(
				{ acquisitionTarget: { companyId: "company-1" } },
				false,
			),
		).toBe("overview");
	});

	it("groups qualification blockers ahead of other unknown criteria", () => {
		const blockingUnknown = {
			id: "revenue" as const,
			result: "UNKNOWN" as const,
			explanation: "No supported revenue evidence was found.",
			blocksQualification: true,
			evidence: [],
		};
		const otherUnknown = {
			id: "asset-profile" as const,
			result: "UNKNOWN" as const,
			explanation: "The asset profile is not public.",
			blocksQualification: false,
			evidence: [],
		};

		expect(criterionGroups([otherUnknown, blockingUnknown])).toEqual({
			blockers: [blockingUnknown],
			assessments: [],
			unknowns: [otherUnknown],
		});
	});

	it("keeps current research state separate from the last successful pass", () => {
		const expected = {
			queued: "Research queued",
			running: "Research in progress",
			retrying: "Research retrying",
			failed: "Research failed",
		} as const;

		for (const [status, label] of Object.entries(expected)) {
			const copy = targetResearchCopy({
				status: status as keyof typeof expected,
				error: status === "failed" ? "Provider unavailable" : null,
			});

			expect(copy.label).toBe(label);
			expect(JSON.stringify(copy).toLowerCase()).not.toContain("researched at");
			expect(JSON.stringify(copy).toLowerCase()).not.toContain(
				"last successful",
			);
		}

		expect(targetResearchCopy({ status: "queued" }).busy).toBe(true);
		expect(targetResearchCopy({ status: "running" }).busy).toBe(true);
		expect(targetResearchCopy({ status: "retrying" }).busy).toBe(true);
	});

	it("maps active acquisition research to banner activity", () => {
		expect(acquisitionResearchActivity({ status: "queued" })).toBe("queued");
		expect(acquisitionResearchActivity({ status: "running" })).toBe("running");
		expect(acquisitionResearchActivity({ status: "retrying" })).toBe("running");
		expect(acquisitionResearchActivity({ status: "idle" })).toBeNull();
		expect(acquisitionResearchActivity({ status: "failed" })).toBeNull();
	});

	it("maps blocked target promotion to a corrective action", () => {
		expect(
			targetResearchCopy({
				status: "blocked",
				blocker: "missing-domain",
			}).action,
		).toEqual({ kind: "domain", label: "Add a domain" });
		expect(
			targetResearchCopy({
				status: "blocked",
				blocker: "missing-buy-box",
			}).action,
		).toEqual({ kind: "buy-box", label: "Complete the buy box" });
	});

	it("warns conservatively for legacy research without revision provenance", () => {
		expect(
			legacyResearchRevisionNotice("untracked", "2026-01-01T00:00:00.000Z"),
		).toBe(
			"This research predates buy-box revision tracking. Refresh it to confirm it still matches your current criteria.",
		);
		expect(legacyResearchRevisionNotice("untracked", null)).toBeNull();
		expect(
			legacyResearchRevisionNotice("current", "2026-01-01T00:00:00.000Z"),
		).toBeNull();
	});

	it("polls research history only while a run is active", () => {
		expect(researchHistoryPollInterval(undefined)).toBe(false);
		expect(researchHistoryPollInterval([])).toBe(false);
		expect(researchHistoryPollInterval([{ status: "FAILED" }])).toBe(false);
		expect(researchHistoryPollInterval([{ status: "SUCCEEDED" }])).toBe(false);
		expect(researchHistoryPollInterval([{ status: "RUNNING" }])).toBe(3000);
	});

	it("marks malformed successful research snapshots unavailable", () => {
		expect(researchSnapshotUnavailable("SUCCEEDED", null)).toBe(true);
		expect(researchSnapshotUnavailable("SUCCEEDED", "Valid summary")).toBe(
			false,
		);
		expect(researchSnapshotUnavailable("FAILED", null)).toBe(false);
	});

	it("discloses acquisition amounts excluded from normalized sorting", () => {
		expect(engagementAmountComparisonNote(null, null)).toBeNull();
		expect(engagementAmountComparisonNote(10_000, 10_000)).toBeNull();
		expect(engagementAmountComparisonNote(10_000, null)).toBe(
			"FX unavailable · excluded from normalized sorting",
		);
	});
});
