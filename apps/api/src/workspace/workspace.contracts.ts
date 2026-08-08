import { WORKSPACE_ROLES } from "@crm/auth";
import {
	AcquisitionAssetPreference,
	AcquisitionOwnerInvolvement,
	AcquisitionRevenuePreference,
	WorkspaceMode,
} from "@crm/db";
import { isCurrencyCode } from "@crm/db/currency";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const memberListInput = listInput.extend({
	role: z.string().default("all"),
});

export type MemberListInput = z.infer<typeof memberListInput>;

export const updateWorkspaceInput = z.object({
	name: z.string().trim().min(1).max(120),
	website: z.string().trim().min(1).max(255),
});

const acquisitionList = z
	.array(z.string().trim().min(1).max(80))
	.max(25)
	.default([]);

const amount = z
	.number()
	.int()
	.nonnegative()
	.max(Number.MAX_SAFE_INTEGER)
	.nullable();

const optionalText = z.string().trim().max(500).nullable();

export const setWorkspaceModeInput = z.object({
	mode: z.enum([WorkspaceMode.SALES, WorkspaceMode.ACQUISITION]),
});

export const updateAcquisitionProfileInput = z
	.object({
		preferredIndustries: acquisitionList,
		geographies: acquisitionList,
		excludedCategories: acquisitionList,
		currency: z
			.string()
			.trim()
			.toUpperCase()
			.refine(isCurrencyCode, "Choose a supported currency."),
		revenueMinCents: amount,
		revenueMaxCents: amount,
		ebitdaMinCents: amount,
		ebitdaMaxCents: amount,
		purchasePriceMinCents: amount,
		purchasePriceMaxCents: amount,
		ownerInvolvement: z
			.enum([
				AcquisitionOwnerInvolvement.PASSIVE,
				AcquisitionOwnerInvolvement.TRANSITIONAL,
				AcquisitionOwnerInvolvement.OPERATOR,
			])
			.nullable(),
		recurringRevenuePreference: z
			.enum([
				AcquisitionRevenuePreference.REQUIRED,
				AcquisitionRevenuePreference.PREFERRED,
				AcquisitionRevenuePreference.OPTIONAL,
			])
			.nullable(),
		customerConcentrationMax: z.number().int().min(0).max(100).nullable(),
		assetPreference: z
			.enum([
				AcquisitionAssetPreference.ASSET_LIGHT,
				AcquisitionAssetPreference.BALANCED,
				AcquisitionAssetPreference.ASSET_HEAVY,
			])
			.nullable(),
		financingAssumptions: optionalText,
	})
	.superRefine((input, context) => {
		for (const [minimum, maximum, path] of [
			[input.revenueMinCents, input.revenueMaxCents, "revenueMaxCents"],
			[input.ebitdaMinCents, input.ebitdaMaxCents, "ebitdaMaxCents"],
			[
				input.purchasePriceMinCents,
				input.purchasePriceMaxCents,
				"purchasePriceMaxCents",
			],
		] as const) {
			if (minimum !== null && maximum !== null && minimum > maximum) {
				context.addIssue({
					code: "custom",
					message: "The maximum must be at least the minimum.",
					path: [path],
				});
			}
		}
	});

export const setMemberRoleInput = z.object({
	memberId: z.string().min(1),
	role: z.enum(WORKSPACE_ROLES),
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInput>;
export type SetMemberRoleInput = z.infer<typeof setMemberRoleInput>;
export type SetWorkspaceModeInput = z.infer<typeof setWorkspaceModeInput>;
export type UpdateAcquisitionProfileInput = z.infer<
	typeof updateAcquisitionProfileInput
>;
