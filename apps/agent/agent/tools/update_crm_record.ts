import { defineTool } from "eve/tools";
import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";
import { CRM, enabled, unavailableCapability } from "../lib/capabilities";
import { focusOn } from "../lib/focus";
import {
	updateCompany,
	updateContact,
	updateDeal,
	writeError,
} from "../lib/record-writes";

const company = z.object({
	kind: z.literal("company"),
	recordId: z.string().min(1),
	name: z.string().trim().min(1).optional(),
	domain: z.string().trim().nullable().optional(),
	website: z.string().trim().nullable().optional(),
	description: z.string().trim().nullable().optional(),
	industry: z.string().trim().nullable().optional(),
	city: z.string().trim().nullable().optional(),
	stateCode: z.string().trim().nullable().optional(),
	country: z.string().trim().nullable().optional(),
	phone: z.string().trim().nullable().optional(),
	email: z.string().trim().nullable().optional(),
	linkedinUrl: z.string().trim().nullable().optional(),
});

const contact = z.object({
	kind: z.literal("contact"),
	recordId: z.string().min(1),
	firstName: z.string().trim().min(1).optional(),
	lastName: z.string().trim().nullable().optional(),
	email: z.union([z.email(), z.literal(""), z.null()]).optional(),
	phone: z.string().trim().nullable().optional(),
	title: z.string().trim().nullable().optional(),
	linkedinUrl: z.string().trim().nullable().optional(),
	twitterUrl: z.string().trim().nullable().optional(),
	githubUrl: z.string().trim().nullable().optional(),
	companyId: z.string().min(1).nullable().optional(),
});

const deal = z.object({
	kind: z.literal("deal"),
	recordId: z.string().min(1),
	name: z.string().trim().min(1).optional(),
	description: z.string().trim().nullable().optional(),
	expectedCloseDate: z.string().nullable().optional(),
	companyId: z.string().min(1).optional(),
});

export default defineTool({
	description:
		"Update an existing CRM company, contact, or deal when a rep explicitly asks. Search first if the record id is unknown. Update only the fields the rep named; evidence-based enrichment still goes through record_fact.",
	inputSchema: z.discriminatedUnion("kind", [company, contact, deal]),
	approval: sensitiveWrite(
		"Update only the named CRM fields after a rep confirms the record and values.",
	),
	async execute(input) {
		if (!(await enabled(CRM))) return unavailableCapability("CRM database");

		try {
			if (input.kind === "company") {
				const updated = await updateCompany(input.recordId, input);
				focusOn({ companyId: updated.id });
				return { updated: true as const, kind: input.kind, ...updated };
			}

			if (input.kind === "contact") {
				const updated = await updateContact(input.recordId, input);
				focusOn({ contactId: updated.id });
				return { updated: true as const, kind: input.kind, ...updated };
			}

			const updated = await updateDeal(input.recordId, input);
			focusOn({ dealId: updated.id });
			return { updated: true as const, kind: input.kind, ...updated };
		} catch (error) {
			return {
				updated: false as const,
				kind: input.kind,
				reason: writeError(error),
			};
		}
	},
});
