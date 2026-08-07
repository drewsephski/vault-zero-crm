import { defineTool } from "eve/tools";
import { z } from "zod";
import { CRM, enabled, unavailableCapability } from "../lib/capabilities";
import { readDealHistory } from "../lib/accounts";
import { focusOn } from "../lib/focus";

export default defineTool({
	description:
		"Read a deal in full: stage and how long it has been there, value, close date, the whole stage history, who is on it with their contact ids, the correspondence and meetings with those people, and the notes. Free — call it first in a deal session.",
	inputSchema: z.object({
		dealId: z.string(),
		threads: z
			.number()
			.int()
			.min(1)
			.max(20)
			.default(5)
			.describe("How many recent threads to read."),
	}),
	async execute({ dealId, threads }) {
		if (!(await enabled(CRM))) return unavailableCapability("CRM database");

		let history;
		try {
			history = await readDealHistory(dealId, { threads });
		} catch {
			return unavailableCapability("CRM database");
		}
		if (!history) return { found: false as const, reason: "No such deal." };

		focusOn({ companyId: history.company.id });

		return { found: true as const, ...history };
	},
});
