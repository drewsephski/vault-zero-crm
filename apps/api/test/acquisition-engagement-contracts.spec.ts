import { describe, expect, it } from "bun:test";
import { AcquisitionEngagementStage } from "@crm/db";
import {
	listAcquisitionEngagementsInput,
	updateAcquisitionEngagementStageInput,
} from "../src/acquisition/acquisition-engagements.contracts";

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
});
