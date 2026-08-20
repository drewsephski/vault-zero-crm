import {
	AcquisitionAssetPreference,
	AcquisitionOwnerInvolvement,
	AcquisitionRevenuePreference,
} from "@crm/db/enums";
import { isDossierReady } from "@crm/db/acquisition";
import { formatMoneyCompact } from "@crm/ui/lib/format";
import type { RouterOutputs } from "@/lib/trpc/types";

type Profile = RouterOutputs["workspace"]["acquisitionProfile"];

export type BuyBoxMutationInput = {
	preferredIndustries: string[];
	geographies: string[];
	excludedCategories: string[];
	currency: string;
	revenueMinCents: number | null;
	revenueMaxCents: number | null;
	ebitdaMinCents: number | null;
	ebitdaMaxCents: number | null;
	purchasePriceMinCents: number | null;
	purchasePriceMaxCents: number | null;
	ownerInvolvement: Profile["ownerInvolvement"];
	recurringRevenuePreference: Profile["recurringRevenuePreference"];
	customerConcentrationMax: number | null;
	assetPreference: Profile["assetPreference"];
	financingAssumptions: string | null;
};

export type BuyBoxSummaryLine = {
	label: string;
	value: string;
};

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

export type BuyBoxField = keyof BuyBoxDraft;
export type BuyBoxErrors = Partial<Record<BuyBoxField, string>>;

export const BUY_BOX_FIELD_IDS = {
	preferredIndustries: "buy-box-preferred-industries",
	geographies: "buy-box-geographies",
	excludedCategories: "buy-box-excluded-categories",
	currency: "buy-box-currency",
	revenueMin: "buy-box-revenue-min",
	revenueMax: "buy-box-revenue-max",
	ebitdaMin: "buy-box-ebitda-min",
	ebitdaMax: "buy-box-ebitda-max",
	purchasePriceMin: "buy-box-purchase-price-min",
	purchasePriceMax: "buy-box-purchase-price-max",
	ownerInvolvement: "buy-box-owner-involvement",
	recurringRevenuePreference: "buy-box-recurring-revenue",
	customerConcentrationMax: "buy-box-customer-concentration",
	assetPreference: "buy-box-asset-preference",
	financingAssumptions: "buy-box-financing-assumptions",
} as const satisfies Record<BuyBoxField, string>;

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

export function appendListValues(value: string, additions: string): string {
	const entries = listValues(value);
	const seen = new Set(entries.map((entry) => entry.toLowerCase()));
	for (const entry of listValues(additions)) {
		const normalized = entry.toLowerCase();
		if (seen.has(normalized)) continue;
		entries.push(entry);
		seen.add(normalized);
	}
	return entries.join(", ");
}

export function moneySliderState(
	minimum: string,
	maximum: string,
	baseMaximum: number,
	step: number,
): {
	minimumValue: number | null;
	maximumValue: number | null;
	rangeMaximum: number;
	values: [number, number];
} {
	const minimumValue = numericMoneyValue(minimum);
	const maximumValue = numericMoneyValue(maximum);
	const rangeMaximum = Math.max(
		baseMaximum,
		Math.ceil(Math.max(minimumValue ?? 0, maximumValue ?? 0) / step) * step,
	);
	const lowerValue = Math.min(minimumValue ?? 0, rangeMaximum);
	return {
		minimumValue,
		maximumValue,
		rangeMaximum,
		values: [
			lowerValue,
			Math.max(
				Math.min(maximumValue ?? rangeMaximum, rangeMaximum),
				lowerValue,
			),
		],
	};
}

export function moneySliderDraft(
	values: readonly number[],
	minimum: string,
	maximum: string,
	rangeMaximum: number,
): [string, string] {
	const nextMinimum = values[0] ?? 0;
	const nextMaximum = values[1] ?? rangeMaximum;
	return [
		minimum.trim() === "" && nextMinimum === 0 ? "" : String(nextMinimum),
		maximum.trim() === "" && nextMaximum === rangeMaximum
			? ""
			: String(nextMaximum),
	];
}

function numericMoneyValue(value: string): number | null {
	const amount = Number(value);
	return value.trim() && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function moneyInput(cents: number | null): string {
	return cents === null ? "" : String(cents / 100);
}

export function moneyCents(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const amount = Number(trimmed);
	const cents = Math.round(amount * 100);
	return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(cents)
		? cents
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

const STEP_FIELDS: ReadonlyArray<ReadonlyArray<BuyBoxField>> = [
	["preferredIndustries", "geographies", "excludedCategories"],
	[
		"currency",
		"revenueMin",
		"revenueMax",
		"ebitdaMin",
		"ebitdaMax",
		"purchasePriceMin",
		"purchasePriceMax",
	],
	[
		"ownerInvolvement",
		"recurringRevenuePreference",
		"customerConcentrationMax",
		"assetPreference",
	],
	["financingAssumptions"],
];

export function validateBuyBoxDraft(values: BuyBoxDraft): BuyBoxErrors {
	const errors: BuyBoxErrors = {};

	for (const [field, label] of [
		["preferredIndustries", "Preferred industries"],
		["geographies", "Geographies"],
		["excludedCategories", "Excluded categories"],
	] as const) {
		const entries = listValues(values[field]);
		if (entries.length > 25)
			errors[field] = `${label} can include up to 25 items.`;
		else if (entries.some((entry) => entry.length > 80))
			errors[field] =
				`Each ${label.toLowerCase()} item must be 80 characters or fewer.`;
	}

	for (const [field, label] of [
		["revenueMin", "Revenue minimum"],
		["revenueMax", "Revenue maximum"],
		["ebitdaMin", "EBITDA or SDE minimum"],
		["ebitdaMax", "EBITDA or SDE maximum"],
		["purchasePriceMin", "Purchase price minimum"],
		["purchasePriceMax", "Purchase price maximum"],
	] as const) {
		if (values[field].trim() && moneyCents(values[field]) === null) {
			errors[field] = `${label} must be a valid non-negative amount.`;
		}
	}

	for (const [minimum, maximum] of [
		["revenueMin", "revenueMax"],
		["ebitdaMin", "ebitdaMax"],
		["purchasePriceMin", "purchasePriceMax"],
	] as const) {
		const min = moneyCents(values[minimum]);
		const max = moneyCents(values[maximum]);
		if (
			!errors[minimum] &&
			!errors[maximum] &&
			min !== null &&
			max !== null &&
			min > max
		) {
			errors[maximum] = "The maximum must be at least the minimum.";
		}
	}

	if (
		values.customerConcentrationMax.trim() &&
		percentage(values.customerConcentrationMax) === null
	) {
		errors.customerConcentrationMax = "Enter a whole percentage from 0 to 100.";
	}

	if (values.financingAssumptions.trim().length > 500) {
		errors.financingAssumptions =
			"Financing assumptions must be 500 characters or fewer.";
	}

	return errors;
}

export function errorsForStep(
	errors: BuyBoxErrors,
	step: number,
): BuyBoxErrors {
	const fields = STEP_FIELDS[step] ?? [];
	return Object.fromEntries(
		fields.flatMap((field) => (errors[field] ? [[field, errors[field]]] : [])),
	) as BuyBoxErrors;
}

export function buyBoxIsConfigured(profile: Profile): boolean {
	return isDossierReady({
		preferredIndustries: profile.preferredIndustries,
		geographies: profile.geographies,
		excludedCategories: profile.excludedCategories,
		revenueMin: profile.revenueMinCents,
		revenueMax: profile.revenueMaxCents,
		ebitdaMin: profile.ebitdaMinCents,
		ebitdaMax: profile.ebitdaMaxCents,
		purchasePriceMin: profile.purchasePriceMinCents,
		purchasePriceMax: profile.purchasePriceMaxCents,
		ownerInvolvement: profile.ownerInvolvement,
		recurringRevenuePreference: profile.recurringRevenuePreference,
		customerConcentrationMax: profile.customerConcentrationMax,
		assetPreference: profile.assetPreference,
		financingAssumptions: profile.financingAssumptions,
	});
}

export function emptyBuyBoxDraft(currency: string): BuyBoxDraft {
	return {
		preferredIndustries: "",
		geographies: "",
		excludedCategories: "",
		currency,
		revenueMin: "",
		revenueMax: "",
		ebitdaMin: "",
		ebitdaMax: "",
		purchasePriceMin: "",
		purchasePriceMax: "",
		ownerInvolvement: null,
		recurringRevenuePreference: null,
		customerConcentrationMax: "",
		assetPreference: null,
		financingAssumptions: "",
	};
}

export function buyBoxMutationPayload(draft: BuyBoxDraft): BuyBoxMutationInput {
	return {
		preferredIndustries: listValues(draft.preferredIndustries),
		geographies: listValues(draft.geographies),
		excludedCategories: listValues(draft.excludedCategories),
		currency: draft.currency,
		revenueMinCents: moneyCents(draft.revenueMin),
		revenueMaxCents: moneyCents(draft.revenueMax),
		ebitdaMinCents: moneyCents(draft.ebitdaMin),
		ebitdaMaxCents: moneyCents(draft.ebitdaMax),
		purchasePriceMinCents: moneyCents(draft.purchasePriceMin),
		purchasePriceMaxCents: moneyCents(draft.purchasePriceMax),
		ownerInvolvement: draft.ownerInvolvement,
		recurringRevenuePreference: draft.recurringRevenuePreference,
		customerConcentrationMax: percentage(draft.customerConcentrationMax),
		assetPreference: draft.assetPreference,
		financingAssumptions: draft.financingAssumptions.trim() || null,
	};
}

export function buyBoxSummaryLines(profile: Profile): BuyBoxSummaryLine[] {
	const lines: BuyBoxSummaryLine[] = [];
	const currency = profile.currency.toLowerCase();

	if (profile.preferredIndustries.length > 0) {
		lines.push({
			label: "Industries",
			value: formatListSummary(profile.preferredIndustries),
		});
	}
	if (profile.geographies.length > 0) {
		lines.push({
			label: "Geography",
			value: formatListSummary(profile.geographies),
		});
	}
	if (profile.excludedCategories.length > 0) {
		lines.push({
			label: "Exclusions",
			value: formatListSummary(profile.excludedCategories),
		});
	}

	const revenue = formatMoneyRange(
		profile.revenueMinCents,
		profile.revenueMaxCents,
		currency,
	);
	if (revenue) lines.push({ label: "Annual revenue", value: revenue });

	const ebitda = formatMoneyRange(
		profile.ebitdaMinCents,
		profile.ebitdaMaxCents,
		currency,
	);
	if (ebitda) lines.push({ label: "EBITDA or SDE", value: ebitda });

	const purchasePrice = formatMoneyRange(
		profile.purchasePriceMinCents,
		profile.purchasePriceMaxCents,
		currency,
	);
	if (purchasePrice) lines.push({ label: "Purchase price", value: purchasePrice });

	if (profile.ownerInvolvement) {
		lines.push({
			label: "Owner involvement",
			value: OWNER_INVOLVEMENT_LABELS[profile.ownerInvolvement],
		});
	}
	if (profile.recurringRevenuePreference) {
		lines.push({
			label: "Recurring revenue",
			value: RECURRING_REVENUE_LABELS[profile.recurringRevenuePreference],
		});
	}
	if (profile.customerConcentrationMax !== null) {
		lines.push({
			label: "Max customer concentration",
			value: `${profile.customerConcentrationMax}%`,
		});
	}
	if (profile.assetPreference) {
		lines.push({
			label: "Asset profile",
			value: ASSET_PREFERENCE_LABELS[profile.assetPreference],
		});
	}
	if (profile.financingAssumptions?.trim()) {
		lines.push({
			label: "Financing",
			value: profile.financingAssumptions.trim(),
		});
	}

	return lines;
}

const OWNER_INVOLVEMENT_LABELS = {
	[AcquisitionOwnerInvolvement.PASSIVE]: "Manager-run",
	[AcquisitionOwnerInvolvement.TRANSITIONAL]: "Transition period",
	[AcquisitionOwnerInvolvement.OPERATOR]: "Buyer-operated",
} as const;

const RECURRING_REVENUE_LABELS = {
	[AcquisitionRevenuePreference.REQUIRED]: "Required",
	[AcquisitionRevenuePreference.PREFERRED]: "Preferred",
	[AcquisitionRevenuePreference.OPTIONAL]: "Not required",
} as const;

const ASSET_PREFERENCE_LABELS = {
	[AcquisitionAssetPreference.ASSET_LIGHT]: "Asset-light",
	[AcquisitionAssetPreference.BALANCED]: "Balanced",
	[AcquisitionAssetPreference.ASSET_HEAVY]: "Asset-heavy",
} as const;

function formatListSummary(values: readonly string[]): string {
	if (values.length <= 3) return values.join(", ");
	return `${values.slice(0, 3).join(", ")} +${values.length - 3} more`;
}

function formatMoneyRange(
	minimum: number | null,
	maximum: number | null,
	currency: string,
): string | null {
	if (minimum === null && maximum === null) return null;
	if (minimum !== null && maximum !== null) {
		return `${formatMoneyCompact(minimum, currency)}–${formatMoneyCompact(maximum, currency)}`;
	}
	if (minimum !== null) {
		return `${formatMoneyCompact(minimum, currency)}+`;
	}
	return `Up to ${formatMoneyCompact(maximum!, currency)}`;
}
