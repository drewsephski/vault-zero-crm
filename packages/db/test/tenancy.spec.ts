import { describe, expect, it } from "bun:test";
import { requireOrganizationId, runInOrganization } from "../src/tenancy";

describe("workspace scope", () => {
	it("throws when no workspace is in context", () => {
		expect(() => requireOrganizationId()).toThrow();
	});

	it("returns the workspace that runInOrganization set", () => {
		expect(runInOrganization("org-a", () => requireOrganizationId())).toBe(
			"org-a",
		);
	});
});
