import { expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { db } from "@crm/db";

const WORKER = join(import.meta.dir, "lanes-fixture-worker.ts");
const TIMEOUT_MS = 20_000;

type WorkerOutput = {
	runId: string;
	reason: string;
	companyId: string;
	overlapCount: number;
	peerFixtureSurvived: boolean;
	remainingFixtures: number;
};

async function readWorker(process: Bun.Subprocess<"pipe", "pipe", "inherit">) {
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	return { stdout, stderr, exitCode };
}

it(
	"keeps overlapping process fixtures isolated through scoped cleanup",
	async () => {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) throw new Error("DATABASE_URL is required");
		const token = randomUUID();
		const firstRunId = `lane-first-${token}`;
		const secondRunId = `lane-second-${token}`;
		const barrier = `lane-barrier-${token}`;
		const reasons = [
			`lane-test-${firstRunId}`,
			`lane-test-${secondRunId}`,
			`lane-test-barrier-${barrier}`,
		];
		const sharedEnv = {
			...process.env,
			DATABASE_URL: databaseUrl,
			CRM_TELEMETRY_DISABLED: "1",
			LANE_FIXTURE_BARRIER: barrier,
		};

		await db.agentTask.deleteMany({ where: { reason: { in: reasons } } });

		try {
			const firstProcess = Bun.spawn(["bun", WORKER], {
				cwd: join(import.meta.dir, ".."),
				env: {
					...sharedEnv,
					TEST_RUN_ID: firstRunId,
					LANE_FIXTURE_PEER_RUN_ID: secondRunId,
					LANE_FIXTURE_ROLE: "first",
				},
				stdout: "pipe",
				stderr: "pipe",
			});
			const secondProcess = Bun.spawn(["bun", WORKER], {
				cwd: join(import.meta.dir, ".."),
				env: {
					...sharedEnv,
					TEST_RUN_ID: secondRunId,
					LANE_FIXTURE_PEER_RUN_ID: firstRunId,
					LANE_FIXTURE_ROLE: "second",
				},
				stdout: "pipe",
				stderr: "pipe",
			});

			const [firstProcessResult, secondProcessResult] = await Promise.all([
				readWorker(firstProcess),
				readWorker(secondProcess),
			]);

			expect({
				first: firstProcessResult.exitCode,
				second: secondProcessResult.exitCode,
				stderr: `${firstProcessResult.stderr}${secondProcessResult.stderr}`,
			}).toEqual({ first: 0, second: 0, stderr: "" });

			const first = JSON.parse(firstProcessResult.stdout) as WorkerOutput;
			const second = JSON.parse(secondProcessResult.stdout) as WorkerOutput;

			expect(first).toEqual({
				runId: firstRunId,
				reason: `lane-test-${firstRunId}`,
				companyId: `lane-company-${firstRunId}-0`,
				overlapCount: 2,
				peerFixtureSurvived: true,
				remainingFixtures: 0,
			});
			expect(second).toEqual({
				runId: secondRunId,
				reason: `lane-test-${secondRunId}`,
				companyId: `lane-company-${secondRunId}-0`,
				overlapCount: 2,
				peerFixtureSurvived: true,
				remainingFixtures: 0,
			});
		} finally {
			await db.agentTask.deleteMany({ where: { reason: { in: reasons } } });
		}
	},
	TIMEOUT_MS,
);
