import { ActivityType, db } from "@crm/db";
import { resolveAutomatedActivityAuthor } from "@crm/db/activity-author";
import { z } from "zod";
import { focusOn } from "../lib/focus";
import { companyProfileRequester } from "../lib/tasks";
import { defineTool } from "../lib/tool";

const text = z.string().trim().min(1).max(2000);

export default defineTool({
	description:
		"Persist a sourced company research brief to the CRM timeline after researching with AnySearch and Tavily. A dispatched company-profile task is incomplete until this succeeds.",
	inputSchema: z.object({
		companyId: z.string().min(1),
		positioning: text.describe("What the company sells and who it serves."),
		pricingModel: text.optional(),
		targetCustomer: text.optional(),
		notableCustomers: z.array(text).max(20).default([]),
		recentNews: z.array(text).max(20).default([]),
		sourceUrls: z.array(z.string().url()).min(1).max(20),
		providers: z
			.array(z.enum(["anysearch", "tavily"]))
			.min(1)
			.max(2),
	}),
	async execute(input, ctx) {
		focusOn({ companyId: input.companyId });
		const company = await db.company.findUnique({
			where: { id: input.companyId },
			select: { id: true, name: true, ownerId: true },
		});
		if (!company) {
			return { written: false as const, reason: "No such company." };
		}

		const requestedById = await companyProfileRequester(company.id);
		const author =
			requestedById ??
			(await resolveAutomatedActivityAuthor(db, [company.ownerId]));
		if (!author) {
			return { written: false as const, reason: "No user to attribute to." };
		}

		const lines = [input.positioning];
		if (input.pricingModel) lines.push(`Pricing: ${input.pricingModel}`);
		if (input.targetCustomer) lines.push(`Sells to: ${input.targetCustomer}`);
		if (input.notableCustomers.length > 0) {
			lines.push(`Customers: ${input.notableCustomers.join(", ")}`);
		}
		if (input.recentNews.length > 0) {
			lines.push(
				`Recently:\n${input.recentNews.map((item) => `• ${item}`).join("\n")}`,
			);
		}
		lines.push(
			`Sources:\n${input.sourceUrls.map((url) => `- ${url}`).join("\n")}`,
		);

		const activity = await db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: `Research brief — ${company.name}`,
				body: lines.join("\n\n"),
				occurredAt: new Date(),
				companyId: company.id,
				createdById: author,
				meta: {
					source: "web-search",
					providers: [...new Set(input.providers)],
					sourceUrls: [...new Set(input.sourceUrls)],
					sessionId: ctx.session.id,
				},
			},
			select: { id: true },
		});

		await db.company.update({
			where: { id: company.id },
			data: { lastActivityAt: new Date() },
		});

		return { written: true as const, activityId: activity.id };
	},
});
