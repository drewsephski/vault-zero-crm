import { describe, expect, it } from "bun:test";
import { acquisitionApprovalFeedback } from "../app/(app)/[slug]/acquisition-dashboard";

describe("acquisition candidate approval feedback", () => {
	it("confirms only a durable research queue", () => {
		expect(
			acquisitionApprovalFeedback({ status: "queued", taskId: "task-1" }),
		).toEqual({
			kind: "success",
			message: "Target added. Research queued.",
		});
	});

	it("names the prerequisite that blocked research", () => {
		expect(
			acquisitionApprovalFeedback({
				status: "blocked",
				blocker: "missing-domain",
			}),
		).toEqual({
			kind: "error",
			message: "Target added. Add a domain to start research.",
		});
		expect(
			acquisitionApprovalFeedback({
				status: "blocked",
				blocker: "missing-buy-box",
			}),
		).toEqual({
			kind: "error",
			message: "Target added. Complete the buy box to start research.",
		});
	});

	it("makes a queue failure recoverable", () => {
		expect(
			acquisitionApprovalFeedback({
				status: "failed",
				blocker: "queue-unavailable",
			}),
		).toEqual({
			kind: "error",
			message: "Target added. Unable to queue research. Try again.",
		});
	});
});
