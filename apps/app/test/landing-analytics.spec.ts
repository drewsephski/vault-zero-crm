import { describe, expect, it } from "bun:test";
import { analyticsAllowed } from "../lib/analytics";

describe("analyticsAllowed", () => {
	it("allows the Vault Zero marketing hosts and legacy hosts", () => {
		expect(analyticsAllowed("vaultzero.dev")).toBe(true);
		expect(analyticsAllowed("www.vaultzero.dev")).toBe(true);
		expect(analyticsAllowed("crm.vaultzero.dev")).toBe(true);
		expect(analyticsAllowed("trycrm.ai")).toBe(true);
		expect(analyticsAllowed("www.trycrm.ai")).toBe(true);
	});

	it("ignores case and surrounding whitespace", () => {
		expect(analyticsAllowed(" TryCRM.ai ")).toBe(true);
	});

	it("refuses a self-hosted install serving the same page", () => {
		expect(analyticsAllowed("crm.acme.com")).toBe(false);
		expect(analyticsAllowed("localhost")).toBe(false);
	});

	it("refuses a preview deployment", () => {
		expect(analyticsAllowed("crm-git-lewis-telemetry.vercel.app")).toBe(false);
	});

	it("refuses a host that merely ends in the marketing domain", () => {
		expect(analyticsAllowed("evil-trycrm.ai")).toBe(false);
		expect(analyticsAllowed("trycrm.ai.attacker.com")).toBe(false);
	});
});
