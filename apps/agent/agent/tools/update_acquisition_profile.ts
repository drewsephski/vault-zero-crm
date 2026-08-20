import {
	AcquisitionAssetPreference,
	AcquisitionOwnerInvolvement,
	AcquisitionRevenuePreference,
	type Db,
	db,
	getOrganizationId,
	Prisma,
	WorkspaceMode,
} from "@crm/db";
import { acquisitionProfileChanged } from "@crm/db/acquisition-profile-revision";
import { PRIORITY, queueAgentTask } from "@crm/db/agent-tasks";
import { isCurrencyCode, normalizeCurrency } from "@crm/db/currency";
import { z } from "zod";
import {
	ACQUISITION_PROFILE_SELECT,
	acquisitionProfileValues,
	normalizeAcquisitionList,
	validateAcquisitionRanges,
} from "../lib/acquisition-profile";
import { sensitiveWrite } from "../lib/approval";
import { CRM, enabled, unavailableCapability } from "../lib/capabilities";
import { defineTool } from "../lib/tool";

const list = z.array(z.string().trim().min(1).max(80)).max(25).optional();
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalAmount = amount.nullable().optional();

export const acquisitionProfileInput = z.object({
	operation: z
		.enum(["replace", "update"])
		.describe(
			"Use replace for a complete proposed buy box. Use update only when changing named fields in an existing buy box.",
		),
	preferredIndustries: list,
	geographies: list,
	excludedCategories: list,
	currency: z
		.string()
		.trim()
		.transform(normalizeCurrency)
		.refine(isCurrencyCode, "Choose a supported currency.")
		.optional(),
	revenueMin: optionalAmount.describe(
		"Minimum annual revenue in whole currency units.",
	),
	revenueMax: optionalAmount.describe(
		"Maximum annual revenue in whole currency units.",
	),
	ebitdaMin: optionalAmount.describe(
		"Minimum EBITDA or SDE in whole currency units.",
	),
	ebitdaMax: optionalAmount.describe(
		"Maximum EBITDA or SDE in whole currency units.",
	),
	purchasePriceMin: optionalAmount.describe(
		"Minimum purchase price in whole currency units.",
	),
	purchasePriceMax: optionalAmount.describe(
		"Maximum purchase price in whole currency units.",
	),
	ownerInvolvement: z
		.enum([
			AcquisitionOwnerInvolvement.PASSIVE,
			AcquisitionOwnerInvolvement.TRANSITIONAL,
			AcquisitionOwnerInvolvement.OPERATOR,
		])
		.nullable()
		.optional(),
	recurringRevenuePreference: z
		.enum([
			AcquisitionRevenuePreference.REQUIRED,
			AcquisitionRevenuePreference.PREFERRED,
			AcquisitionRevenuePreference.OPTIONAL,
		])
		.nullable()
		.optional(),
	customerConcentrationMax: z
		.number()
		.int()
		.min(0)
		.max(100)
		.nullable()
		.optional(),
	assetPreference: z
		.enum([
			AcquisitionAssetPreference.ASSET_LIGHT,
			AcquisitionAssetPreference.BALANCED,
			AcquisitionAssetPreference.ASSET_HEAVY,
		])
		.nullable()
		.optional(),
	financingAssumptions: z.string().trim().max(500).nullable().optional(),
});

type Input = z.infer<typeof acquisitionProfileInput>;

export default defineTool({
	description:
		"Fill, replace, or update the workspace acquisition buy box with specific structured criteria. For an empty buy box, gather enough of the rep's goals to produce a useful complete draft, call this tool with operation replace, and let the approval request present the exact proposal. Never call it merely because the buy box is empty; call only after the rep asks for help creating or changing criteria or accepts your offer.",
	inputSchema: acquisitionProfileInput,
	approval: sensitiveWrite(
		"Write the acquisition criteria only after a rep approves the exact proposed buy box.",
	),
	async execute(input, ctx) {
		if (!(await enabled(CRM))) return unavailableCapability("CRM database");

		const userId = ctx.session.auth.current?.principalId;
		if (!userId) {
			return {
				updated: false as const,
				reason: "This session is not attached to a workspace.",
			};
		}

		try {
			const organizationId = getOrganizationId();
			if (!organizationId) {
				return {
					updated: false as const,
					reason: "This session is not attached to a workspace.",
				};
			}

			if (!(await canManageAcquisition(userId, organizationId))) {
				return {
					updated: false as const,
					reason:
						"Only a workspace owner or admin can change the acquisition buy box.",
				};
			}

			const current = await db.acquisitionProfile.findUnique({
				where: { id: organizationId },
				select: ACQUISITION_PROFILE_SELECT,
			});
			const values = mergeValues(input, acquisitionProfileValues(current));
			const rangeError = validateAcquisitionRanges(values);
			if (rangeError) {
				return { updated: false as const, reason: rangeError };
			}

			const fields = {
				preferredIndustries: values.preferredIndustries,
				geographies: values.geographies,
				excludedCategories: values.excludedCategories,
				currency: values.currency,
				revenueMin: decimal(values.revenueMin),
				revenueMax: decimal(values.revenueMax),
				ebitdaMin: decimal(values.ebitdaMin),
				ebitdaMax: decimal(values.ebitdaMax),
				purchasePriceMin: decimal(values.purchasePriceMin),
				purchasePriceMax: decimal(values.purchasePriceMax),
				ownerInvolvement: values.ownerInvolvement,
				recurringRevenuePreference: values.recurringRevenuePreference,
				customerConcentrationMax: values.customerConcentrationMax,
				assetPreference: values.assetPreference,
				financingAssumptions: values.financingAssumptions,
			};

			const changed = acquisitionProfileChanged(current, fields);
			const profile = !current
				? await db.acquisitionProfile.create({
						data: {
							id: organizationId,
							mode: WorkspaceMode.ACQUISITION,
							buyBoxRevision: 0,
							...fields,
						},
						select: ACQUISITION_PROFILE_SELECT,
					})
				: changed
					? await db.acquisitionProfile.update({
							where: { id: organizationId },
							data: { ...fields, buyBoxRevision: { increment: 1 } },
							select: ACQUISITION_PROFILE_SELECT,
						})
					: current;

			let discoveryQueued = false;
			if (
				(changed && profile.preferredIndustries.length > 0) ||
				(changed && profile.geographies.length > 0)
			) {
				try {
					await queueAcquisitionDiscovery(db);
					discoveryQueued = true;
				} catch (error) {
					console.error("[agent] could not queue acquisition discovery", error);
				}
			}
			if (changed) await queueAcquisitionTargetRefreshes(db);

			return {
				updated: true as const,
				discoveryQueued,
				profile: acquisitionProfileValues(profile),
			};
		} catch (error) {
			console.error("[agent] could not update the acquisition profile", error);
			return {
				updated: false as const,
				reason: "The acquisition profile could not be updated.",
			};
		}
	},
});

export function mergeValues(
	input: Input,
	current: ReturnType<typeof acquisitionProfileValues>,
): ReturnType<typeof acquisitionProfileValues> {
	const base =
		input.operation === "replace" ? acquisitionProfileValues(null) : current;

	return {
		preferredIndustries:
			input.preferredIndustries === undefined
				? base.preferredIndustries
				: normalizeAcquisitionList(input.preferredIndustries),
		geographies:
			input.geographies === undefined
				? base.geographies
				: normalizeAcquisitionList(input.geographies),
		excludedCategories:
			input.excludedCategories === undefined
				? base.excludedCategories
				: normalizeAcquisitionList(input.excludedCategories),
		currency: input.currency ?? base.currency,
		revenueMin:
			input.revenueMin === undefined ? base.revenueMin : input.revenueMin,
		revenueMax:
			input.revenueMax === undefined ? base.revenueMax : input.revenueMax,
		ebitdaMin: input.ebitdaMin === undefined ? base.ebitdaMin : input.ebitdaMin,
		ebitdaMax: input.ebitdaMax === undefined ? base.ebitdaMax : input.ebitdaMax,
		purchasePriceMin:
			input.purchasePriceMin === undefined
				? base.purchasePriceMin
				: input.purchasePriceMin,
		purchasePriceMax:
			input.purchasePriceMax === undefined
				? base.purchasePriceMax
				: input.purchasePriceMax,
		ownerInvolvement:
			input.ownerInvolvement === undefined
				? base.ownerInvolvement
				: input.ownerInvolvement,
		recurringRevenuePreference:
			input.recurringRevenuePreference === undefined
				? base.recurringRevenuePreference
				: input.recurringRevenuePreference,
		customerConcentrationMax:
			input.customerConcentrationMax === undefined
				? base.customerConcentrationMax
				: input.customerConcentrationMax,
		assetPreference:
			input.assetPreference === undefined
				? base.assetPreference
				: input.assetPreference,
		financingAssumptions:
			input.financingAssumptions === undefined
				? base.financingAssumptions
				: input.financingAssumptions || null,
	};
}

async function canManageAcquisition(
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const membership = await db.member.findUnique({
		where: {
			organizationId_userId: { organizationId, userId },
		},
		select: { role: true },
	});
	return membership?.role === "owner" || membership?.role === "admin";
}

function decimal(value: number | null): Prisma.Decimal | null {
	return value === null ? null : new Prisma.Decimal(value);
}

export async function queueAcquisitionDiscovery(database: Db) {
	return queueAgentTask(database, {
		kind: "acquisition-discovery",
		reason: "Eve updated the buy box; refresh the discovery strategy",
		priority: PRIORITY.acquisitionDiscovery,
		budget: 12,
		dueAt: new Date(),
	});
}

async function queueAcquisitionTargetRefreshes(database: Db): Promise<void> {
	const targets = await database.acquisitionTarget.findMany({
		where: { company: { domain: { not: null } } },
		select: { companyId: true },
		orderBy: { researchedAt: "asc" },
		take: 50,
	});

	await Promise.all(
		targets.map((target) =>
			queueAgentTask(database, {
				companyId: target.companyId,
				kind: "acquisition-refresh",
				reason: "Buy box changed — acquisition research refresh queued",
				priority: PRIORITY.acquisitionRefresh,
				budget: 12,
				dueAt: new Date(),
			}),
		),
	);
}
