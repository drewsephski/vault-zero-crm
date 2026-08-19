import { describe, expect, it } from "bun:test";
import { resolvePrismaDatabaseUrl } from "../src/database-url";

describe("resolvePrismaDatabaseUrl", () => {
	it("prefers an explicit direct migration URL", () => {
		expect(
			resolvePrismaDatabaseUrl({
				DATABASE_URL:
					"postgresql://user:secret@ep-example-pooler.us-east-2.aws.neon.tech/app?sslmode=require",
				DIRECT_DATABASE_URL:
					"postgresql://user:secret@ep-example.us-east-2.aws.neon.tech/app?sslmode=require",
			}),
		).toBe(
			"postgresql://user:secret@ep-example.us-east-2.aws.neon.tech/app?sslmode=require",
		);
	});

	it("converts a Neon pooled URL to the matching direct endpoint", () => {
		expect(
			resolvePrismaDatabaseUrl({
				DATABASE_URL:
					"postgresql://user:secret@ep-example-pooler.c-5.us-east-2.aws.neon.tech/app?sslmode=require&channel_binding=require",
			}),
		).toBe(
			"postgresql://user:secret@ep-example.c-5.us-east-2.aws.neon.tech/app?sslmode=require&channel_binding=require",
		);
	});

	it("does not rewrite a non-Neon pooled hostname", () => {
		const databaseUrl =
			"postgresql://user:secret@postgres-pooler.internal/app?sslmode=require";

		expect(resolvePrismaDatabaseUrl({ DATABASE_URL: databaseUrl })).toBe(
			databaseUrl,
		);
	});

	it("fails clearly when no database URL is configured", () => {
		expect(() => resolvePrismaDatabaseUrl({})).toThrow(
			"DATABASE_URL is required for Prisma commands.",
		);
	});
});
