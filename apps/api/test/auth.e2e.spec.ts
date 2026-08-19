import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import "@crm/env/load";
import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { isCanonicalLocalTestDatabase } from "../../../packages/db/test/canonical-workspace-fixture";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
};

fallback(
	"DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
);

describe("Auth (e2e)", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { AppModule } = await import("../src/app.module");

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication({ bodyParser: false });
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("rejects an unauthenticated request to a guarded route", async () => {
		await request(app.getHttpServer()).get("/auth/me").expect(401);
	});

	it("allows an unauthenticated request to an optional-auth route", async () => {
		const response = await request(app.getHttpServer())
			.get("/auth/session")
			.expect(200);

		expect(response.body).toEqual({ authenticated: false, user: null });
	});

	it("mounts the Better Auth handler", async () => {
		const response = await request(app.getHttpServer()).get("/api/auth/ok");

		expect(response.status).not.toBe(404);
	});

	it("lets the sign-in page read what it may offer", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/trpc/sso.signInOptions")
			.expect(200);

		expect(response.body.result.data.providers).toEqual([]);
		expect(typeof response.body.result.data.google).toBe("boolean");
		expect(typeof response.body.result.data.microsoft).toBe("boolean");
	});

	it("keeps the SSO configuration itself behind the session", async () => {
		const response = await request(app.getHttpServer()).get(
			"/api/trpc/sso.settings",
		);

		expect(response.status).toBe(401);
	});

	it("gives each email/password account its own workspace", async () => {
		if (!isCanonicalLocalTestDatabase(process.env.DATABASE_URL ?? "")) {
			return;
		}

		process.env.ALLOWED_SIGN_IN = "";
		const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
		const password = "password12";

		const signUp = async (label: string) => {
			const response = await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Origin", process.env.APP_URL ?? "http://localhost:3000")
				.send({
					name: label,
					email: `${label}.${suffix}@example.test`,
					password,
				});

			expect(response.status).toBeLessThan(300);
			const userId = (response.body as { user?: { id?: string } }).user?.id;
			expect(userId).toBeDefined();
			return userId as string;
		};

		const firstId = await signUp("alpha");
		const secondId = await signUp("beta");
		const organizationIds: string[] = [];

		try {
			const [first, second] = await Promise.all([
				db.member.findFirst({
					where: { userId: firstId },
					select: { organizationId: true, role: true },
				}),
				db.member.findFirst({
					where: { userId: secondId },
					select: { organizationId: true, role: true },
				}),
			]);

			expect(first?.role).toBe("owner");
			expect(second?.role).toBe("owner");
			expect(first?.organizationId).toBeDefined();
			expect(second?.organizationId).toBeDefined();
			expect(first?.organizationId).not.toBe(second?.organizationId);
			expect(first?.organizationId).not.toBe(WORKSPACE_ID);
			expect(second?.organizationId).not.toBe(WORKSPACE_ID);

			if (first) organizationIds.push(first.organizationId);
			if (second) organizationIds.push(second.organizationId);
		} finally {
			await db.member.deleteMany({
				where: { userId: { in: [firstId, secondId] } },
			});
			if (organizationIds.length > 0) {
				await db.organization.deleteMany({
					where: { id: { in: organizationIds } },
				});
			}
			await db.user.deleteMany({ where: { id: { in: [firstId, secondId] } } });
		}
	});
});
