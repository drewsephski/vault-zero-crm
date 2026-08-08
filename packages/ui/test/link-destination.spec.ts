import { describe, expect, it } from "bun:test";
import { describeLinkDestination } from "../src/lib/link-destination";

describe("link destination", () => {
	it("describes email links without exposing the mailto scheme", () => {
		expect(
			describeLinkDestination(
				"mailto:paula.marchetti%40fernhill-accounts-spec.test?subject=Hello",
			),
		).toEqual({
			action: "Compose email",
			description: "Opens your default email app.",
			display: "paula.marchetti@fernhill-accounts-spec.test",
			label: "Email address",
			title: "Compose email?",
			type: "email",
		});
	});

	it("identifies the true host for website links", () => {
		const destination = describeLinkDestination(
			"https://trusted.example@research.example/profile?id=42",
		);

		expect(destination.label).toBe("research.example");
		expect(destination.display).toBe(
			"https://trusted.example@research.example/profile?id=42",
		);
		expect(destination.action).toBe("Open website");
	});

	it("describes phone and unknown links with specific actions", () => {
		expect(describeLinkDestination("tel:%2B13125550100")).toMatchObject({
			action: "Start call",
			display: "+13125550100",
			label: "Phone number",
			type: "phone",
		});
		expect(describeLinkDestination("custom:record/42")).toMatchObject({
			action: "Open link",
			label: "Destination",
			type: "other",
		});
	});
});
