import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";
import { CRM, enabled, unavailableCapability } from "../lib/capabilities";
import { focusOn } from "../lib/focus";
import { createCompany, writeError } from "../lib/record-writes";
import { defineTool } from "../lib/tool";

export default defineTool({
	description:
		"Create a company in the CRM when a rep explicitly asks. Search first so the same company is not created twice. A domain starts brand and structured company-detail work automatically.",
	inputSchema: z.object({
		name: z.string().trim().min(1),
		domain: z.string().trim().optional(),
	}),
	approval: sensitiveWrite(
		"Create the company only after a rep confirms the name and domain.",
	),
	async execute(input) {
		if (!(await enabled(CRM))) return unavailableCapability("CRM database");

		try {
			const company = await createCompany(input);
			focusOn({ companyId: company.id });
			return { created: true as const, ...company };
		} catch (error) {
			return { created: false as const, reason: writeError(error) };
		}
	},
});
