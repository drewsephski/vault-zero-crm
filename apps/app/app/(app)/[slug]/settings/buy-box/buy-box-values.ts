import type { RouterOutputs } from "@/lib/trpc/types";

type Profile = RouterOutputs["workspace"]["acquisitionProfile"];

export type BuyBoxDraft = {
	preferredIndustries: string;
	geographies: string;
	excludedCategories: string;
	currency: string;
	revenueMin: string;
	revenueMax: string;
	ebitdaMin: string;
	ebitdaMax: string;
	purchasePriceMin: string;
	purchasePriceMax: string;
	ownerInvolvement: Profile["ownerInvolvement"];
	recurringRevenuePreference: Profile["recurringRevenuePreference"];
	customerConcentrationMax: string;
	assetPreference: Profile["assetPreference"];
	financingAssumptions: string;
};

export const BUY_BOX_STEPS = [
	"Focus",
	"Financials",
	"Operations",
	"Financing",
] as const;

export function profileDraft(profile: Profile): BuyBoxDraft {
	return {
		preferredIndustries: profile.preferredIndustries.join(", "),
		geographies: profile.geographies.join(", "),
		excludedCategories: profile.excludedCategories.join(", "),
		currency: profile.currency,
		revenueMin: moneyInput(profile.revenueMinCents),
		revenueMax: moneyInput(profile.revenueMaxCents),
		ebitdaMin: moneyInput(profile.ebitdaMinCents),
		ebitdaMax: moneyInput(profile.ebitdaMaxCents),
		purchasePriceMin: moneyInput(profile.purchasePriceMinCents),
		purchasePriceMax: moneyInput(profile.purchasePriceMaxCents),
		ownerInvolvement: profile.ownerInvolvement,
		recurringRevenuePreference: profile.recurringRevenuePreference,
		customerConcentrationMax:
			profile.customerConcentrationMax?.toString() ?? "",
		assetPreference: profile.assetPreference,
		financingAssumptions: profile.financingAssumptions ?? "",
	};
}

export function stepDescription(step: number): string {
	return (
		[
			"Start with the industries and places worth screening.",
			"Set ranges in the selected currency. Leave either side blank when it is open-ended.",
			"Describe the operating profile and risk tolerance.",
			"Record the capital assumptions behind the range.",
		][step] ?? ""
	);
}

export function listValues(value: string): string[] {
	return value
		.split(/[,\n]/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function moneyInput(cents: number | null): string {
	return cents === null ? "" : String(cents / 100);
}

export function moneyCents(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const amount = Number(trimmed);
	return Number.isFinite(amount) && amount >= 0
		? Math.round(amount * 100)
		: null;
}

export function percentage(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const amount = Number(trimmed);
	return Number.isInteger(amount) && amount >= 0 && amount <= 100
		? amount
		: null;
}
