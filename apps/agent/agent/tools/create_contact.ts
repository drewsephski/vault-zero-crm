import { defineTool } from "eve/tools";
import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";
import { CRM, enabled, unavailableCapability } from "../lib/capabilities";
import { focusOn } from "../lib/focus";
import { createContact, writeError } from "../lib/record-writes";

export default defineTool({
	description:
		"Create a new CRM contact after the rep confirms the observed profile and fields. Use only for a person who is not already in the CRM; search first and never create from an unverified search result.",
	inputSchema: z.object({
		firstName: z.string().trim().min(1),
		lastName: z.string().trim().optional(),
		email: z.email().optional(),
		phone: z.string().trim().optional(),
		title: z.string().trim().optional(),
		linkedinUrl: z.string().url().optional(),
		companyId: z.string().trim().optional(),
		ownerId: z.string().trim().optional(),
	}),
	approval: sensitiveWrite(
		"Create the contact only after the rep confirms the profile and the fields to save.",
	),
	async execute(input) {
		if (!(await enabled(CRM))) return unavailableCapability("CRM database");

		try {
			const contact = await createContact(input);
			focusOn({ contactId: contact.id, companyId: input.companyId });
			return { created: true as const, ...contact };
		} catch (error) {
			return { created: false as const, reason: writeError(error) };
		}
	},
});
