import { describe, expect, it } from "bun:test";
import {
	enrichmentActivity,
	isEnriching,
} from "../components/crm/enrichment-status";

describe("enrichmentActivity", () => {
	it("keeps any unfinished agent task visible", () => {
		expect(enrichmentActivity("COMPLETE", true)).toBe("queued");
		expect(isEnriching("COMPLETE", true)).toBe(true);
	});

	it("distinguishes queued work from active research", () => {
		expect(enrichmentActivity("PENDING", true)).toBe("queued");
		expect(enrichmentActivity("RUNNING", true)).toBe("running");
	});

	it("settles when no unfinished task remains", () => {
		expect(enrichmentActivity("COMPLETE", false)).toBeNull();
		expect(isEnriching("FAILED", false)).toBe(false);
	});
});
