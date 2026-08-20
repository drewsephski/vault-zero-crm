import { defineTool } from "../lib/tool";
import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";
import { CRM, enabled, unavailableCapability } from "../lib/capabilities";
import type { Evidence, EvidenceKind } from "../lib/evidence";
import { WEIGHTS } from "../lib/evidence";
import { recordFact } from "../lib/facts";
import { focusOn } from "../lib/focus";
import { slugFromLinkedinInput } from "../lib/linkdapi";
import { createContact, writeError } from "../lib/record-writes";

export default defineTool({
	description:
		"Create a new CRM contact after the rep confirms the observed profile and fields. Use only for a person who is not already in the CRM; search first and never create from an unverified search result. Put researched title and LinkedIn URL in observed with the evidence returned by the profile read; those fields are written through the evidence ledger.",
	inputSchema: z.object({
		firstName: z.string().trim().min(1),
		lastName: z.string().trim().optional().nullable(),
		email: z.email().optional().nullable(),
		phone: z.string().trim().optional().nullable(),
		profileUrl: z.string().trim().min(3).optional().nullable(),
		observed: z
			.array(
				z.object({
					field: z.enum(["title", "linkedinUrl"]),
					value: z.string().trim().min(1),
					evidence: z
						.array(
							z.object({
								kind: z.enum(
									Object.keys(WEIGHTS) as [EvidenceKind, ...EvidenceKind[]],
								),
								detail: z.string().trim().min(1),
								sourceUrl: z.string().url().optional(),
							}),
						)
						.min(1),
				}),
			)
			.max(2)
			.default([]),
		companyId: z.string().trim().optional().nullable(),
		ownerId: z.string().trim().optional().nullable(),
	}),
	approval: sensitiveWrite(
		"Create the contact only after the rep confirms the profile and the fields to save.",
	),
	async execute(input) {
		if (!(await enabled(CRM))) return unavailableCapability("CRM database");

		try {
			const profileSlug = input.profileUrl
				? slugFromLinkedinInput(input.profileUrl)
				: null;
			const profileSourceUrl = profileSlug
				? `https://www.linkedin.com/in/${profileSlug}`
				: undefined;
			if (input.profileUrl && !profileSlug) {
				throw new Error("That is not a LinkedIn profile URL or username.");
			}
			const observed = input.observed.map((item) => {
				if (item.field !== "linkedinUrl") return item;

				const slug = slugFromLinkedinInput(item.value);
				if (!slug)
					throw new Error("The observed LinkedIn profile is not valid.");

				return {
					...item,
					value: `https://www.linkedin.com/in/${slug}`,
				};
			});

			const contact = await createContact(input);
			focusOn({ contactId: contact.id, companyId: input.companyId });

			const facts = [];
			for (const item of observed) {
				facts.push(
					await recordFact({
						contactId: contact.id,
						field: item.field,
						value: item.value,
						evidence: item.evidence as Evidence[],
						method: "linkedin.profile",
						sourceUrl:
							profileSourceUrl ??
							(item.field === "linkedinUrl" ? item.value : undefined),
					}),
				);
			}

			return { created: true as const, ...contact, facts };
		} catch (error) {
			return { created: false as const, reason: writeError(error) };
		}
	},
});
