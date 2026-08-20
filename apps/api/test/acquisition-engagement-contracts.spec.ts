import { describe, expect, it } from "bun:test";
import { AcquisitionEngagementStage } from "@crm/db";
import {
	createAcquisitionEngagementInput,
	listAcquisitionEngagementsInput,
	updateAcquisitionEngagementInput,
	updateAcquisitionEngagementStageInput,
} from "../src/acquisition/acquisition-engagements.contracts";
import { MAX_AMOUNT_CENTS } from "../src/deals/deals.contracts";

describe("acquisition engagement contracts", () => {
	it("rejects unknown list filters", () => {
		expect(
			listAcquisitionEngagementsInput.safeParse({ status: "mystery" }).success,
		).toBe(false);
		expect(
			listAcquisitionEngagementsInput.safeParse({ stage: "mystery" }).success,
		).toBe(false);
	});

	it("requires a reason when passing on an opportunity", () => {
		expect(
			updateAcquisitionEngagementStageInput.safeParse({
				engagementId: "engagement-1",
				stage: AcquisitionEngagementStage.PASSED,
			}).success,
		).toBe(false);
		expect(
			updateAcquisitionEngagementStageInput.safeParse({
				engagementId: "engagement-1",
				stage: AcquisitionEngagementStage.PASSED,
				closedReason: "Seller expectations exceed the buy box.",
			}).success,
		).toBe(true);
	});

	it("rejects engagement amounts above the storage-safe maximum", () => {
		const create = {
			companyId: "company-1",
			idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
		};

		expect(
			createAcquisitionEngagementInput.safeParse({
				...create,
				amountCents: MAX_AMOUNT_CENTS,
			}).success,
		).toBe(true);
		expect(
			createAcquisitionEngagementInput.safeParse({
				...create,
				amountCents: MAX_AMOUNT_CENTS + 1,
			}).success,
		).toBe(false);
		expect(
			updateAcquisitionEngagementInput.safeParse({
				engagementId: "engagement-1",
				amountCents: MAX_AMOUNT_CENTS,
			}).success,
		).toBe(true);
		expect(
			updateAcquisitionEngagementInput.safeParse({
				engagementId: "engagement-1",
				amountCents: MAX_AMOUNT_CENTS + 1,
			}).success,
		).toBe(false);
	});
});
