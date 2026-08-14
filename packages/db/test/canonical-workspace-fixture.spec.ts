import { describe, expect, it } from "bun:test";
import { isCanonicalLocalTestDatabase } from "./canonical-workspace-fixture";

describe("canonical workspace fixture database boundary", () => {
	it("accepts only the dedicated loopback CRM database", () => {
		expect(
			isCanonicalLocalTestDatabase(
				"postgresql://postgres:postgres@127.0.0.1:5432/crm",
			),
		).toBe(true);
		expect(
			isCanonicalLocalTestDatabase(
				"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
			),
		).toBe(true);
		expect(
			isCanonicalLocalTestDatabase(
				"postgresql://postgres:postgres@127.0.0.1:5433/crm",
			),
		).toBe(false);
		expect(
			isCanonicalLocalTestDatabase(
				"postgresql://postgres:postgres@127.0.0.1:5432/other",
			),
		).toBe(false);
		expect(
			isCanonicalLocalTestDatabase(
				"postgresql://example@database.example.com:5432/crm",
			),
		).toBe(false);
	});
});
