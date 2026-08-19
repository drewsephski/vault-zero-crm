import { describe, expect, it } from "bun:test";
import { LOCAL_DATABASE_URL, prismaDatasourceUrl } from "../datasource-url";

describe("prismaDatasourceUrl", () => {
	it("uses DATABASE_URL when it is set", () => {
		expect(prismaDatasourceUrl("postgresql://neon.example/crm")).toBe(
			"postgresql://neon.example/crm",
		);
	});

	it("falls back when DATABASE_URL is empty so prisma generate can run on Vercel", () => {
		expect(prismaDatasourceUrl("")).toBe(LOCAL_DATABASE_URL);
	});
});
