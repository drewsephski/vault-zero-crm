import { randomUUID } from "node:crypto";

export function laneFixtureIdentity(
	runId = process.env.TEST_RUN_ID ?? randomUUID(),
) {
	return {
		runId,
		reason: `lane-test-${runId}`,
		companyId: (index: number) => `lane-company-${runId}-${index}`,
	};
}
