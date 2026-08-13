import { describe, expect, it } from "bun:test";
import { companiesSearchParams } from "../app/(app)/[slug]/companies/companies-search-params";
import {
	criterionGroups,
	defaultCompanyTab,
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
});
