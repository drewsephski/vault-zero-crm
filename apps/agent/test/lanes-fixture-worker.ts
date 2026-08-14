import { db } from "@crm/db";
import { laneFixtureIdentity } from "./lanes-fixture";

const FIXTURE_KIND = "lane-fixture-overlap";
const READY_KIND = "lane-fixture-ready";
const OBSERVED_KIND = "lane-fixture-observed";
const FIRST_VERIFIED_KIND = "lane-fixture-first-verified";
const SECOND_VERIFIED_KIND = "lane-fixture-second-verified";
const WAIT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 20;

function requiredEnvironment(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

async function waitForCount(kind: string, reason: string, count: number) {
	const deadline = Date.now() + WAIT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const actual = await db.agentTask.count({ where: { kind, reason } });
		if (actual === count) return;
		await Bun.sleep(POLL_INTERVAL_MS);
	}
	throw new Error(`Timed out waiting for ${kind}`);
}

async function createMarker(kind: string, reason: string, companyId: string) {
	await db.agentTask.create({
		data: {
			kind,
			reason,
			companyId,
			dueAt: new Date(Date.now() + 60_000),
			priority: 0,
			budget: 1,
		},
	});
}

async function main() {
	const runId = requiredEnvironment("TEST_RUN_ID");
	const peerRunId = requiredEnvironment("LANE_FIXTURE_PEER_RUN_ID");
	const barrier = requiredEnvironment("LANE_FIXTURE_BARRIER");
	const role = requiredEnvironment("LANE_FIXTURE_ROLE");
	if (role !== "first" && role !== "second") {
		throw new Error("LANE_FIXTURE_ROLE must be first or second");
	}

	const identity = laneFixtureIdentity();
	const peerIdentity = laneFixtureIdentity(peerRunId);
	const barrierReason = `lane-test-barrier-${barrier}`;
	const fixtureReasons = [identity.reason, peerIdentity.reason];
	const companyId = identity.companyId(0);
	const markerCompanyId = (kind: string) =>
		`lane-marker-${barrier}-${kind}-${runId}`;

	await db.agentTask.create({
		data: {
			kind: FIXTURE_KIND,
			reason: identity.reason,
			companyId,
			dueAt: new Date(Date.now() + 60_000),
			priority: 0,
			budget: 1,
		},
	});
	await createMarker(READY_KIND, barrierReason, markerCompanyId(READY_KIND));
	await waitForCount(READY_KIND, barrierReason, 2);

	const overlapCount = await db.agentTask.count({
		where: { kind: FIXTURE_KIND, reason: { in: fixtureReasons } },
	});
	if (overlapCount !== 2) throw new Error("Fixture identities collided");

	await createMarker(
		OBSERVED_KIND,
		barrierReason,
		markerCompanyId(OBSERVED_KIND),
	);
	await waitForCount(OBSERVED_KIND, barrierReason, 2);

	let peerFixtureSurvived: boolean;
	if (role === "first") {
		await db.agentTask.deleteMany({ where: { reason: identity.reason } });
		peerFixtureSurvived =
			(await db.agentTask.count({
				where: { kind: FIXTURE_KIND, reason: peerIdentity.reason },
			})) === 1;
		await createMarker(
			FIRST_VERIFIED_KIND,
			barrierReason,
			markerCompanyId(FIRST_VERIFIED_KIND),
		);
		await waitForCount(SECOND_VERIFIED_KIND, barrierReason, 1);
	} else {
		await waitForCount(FIRST_VERIFIED_KIND, barrierReason, 1);
		peerFixtureSurvived =
			(await db.agentTask.count({
				where: { kind: FIXTURE_KIND, reason: identity.reason },
			})) === 1;
		await db.agentTask.deleteMany({ where: { reason: identity.reason } });
		await createMarker(
			SECOND_VERIFIED_KIND,
			barrierReason,
			markerCompanyId(SECOND_VERIFIED_KIND),
		);
	}

	if (!peerFixtureSurvived) throw new Error("Peer cleanup removed the fixture");
	const remainingFixtures = await db.agentTask.count({
		where: { kind: FIXTURE_KIND, reason: { in: fixtureReasons } },
	});

	process.stdout.write(
		JSON.stringify({
			runId: identity.runId,
			reason: identity.reason,
			companyId,
			overlapCount,
			peerFixtureSurvived,
			remainingFixtures,
		}),
	);
}

try {
	await main();
} finally {
	await db.$disconnect();
}
