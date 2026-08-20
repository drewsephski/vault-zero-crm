import { describe, expect, it } from "bun:test";
import { requireOrganizationId, runInOrganization } from "../src/tenancy";

describe("workspace scope", () => {
	it("uses the canonical workspace when tests have no context", () => {
		expect(requireOrganizationId()).toBe("workspace");
	});

	it("returns the workspace that runInOrganization set", () => {
		expect(runInOrganization("org-a", () => requireOrganizationId())).toBe(
			"org-a",
		);
	});
});
