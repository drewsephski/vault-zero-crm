import type {
	AcquisitionAssetPreference,
	AcquisitionOwnerInvolvement,
	AcquisitionRevenuePreference,
	Prisma,
} from "@crm/db";

export const ACQUISITION_PROFILE_SELECT = {
	mode: true,
	preferredIndustries: true,
	geographies: true,
	excludedCategories: true,
	currency: true,
	revenueMin: true,
	revenueMax: true,
	ebitdaMin: true,
	ebitdaMax: true,
	purchasePriceMin: true,
	purchasePriceMax: true,
	ownerInvolvement: true,
	recurringRevenuePreference: true,
	customerConcentrationMax: true,
	assetPreference: true,
	financingAssumptions: true,
} as const;

export type AcquisitionProfileRecord = Prisma.AcquisitionProfileGetPayload<{
	select: typeof ACQUISITION_PROFILE_SELECT;
}>;

export type AcquisitionProfileValues = {
	preferredIndustries: string[];
	geographies: string[];
	excludedCategories: string[];
	currency: string;
	revenueMin: number | null;
	revenueMax: number | null;
	ebitdaMin: number | null;
	ebitdaMax: number | null;
	purchasePriceMin: number | null;
	purchasePriceMax: number | null;
	ownerInvolvement: AcquisitionOwnerInvolvement | null;
	recurringRevenuePreference: AcquisitionRevenuePreference | null;
	customerConcentrationMax: number | null;
	assetPreference: AcquisitionAssetPreference | null;
	financingAssumptions: string | null;
};

export function acquisitionProfileValues(
	profile: AcquisitionProfileRecord | null,
): AcquisitionProfileValues {
	return {
		preferredIndustries: profile?.preferredIndustries ?? [],
		geographies: profile?.geographies ?? [],
		excludedCategories: profile?.excludedCategories ?? [],
		currency: profile?.currency ?? "USD",
		revenueMin: amount(profile?.revenueMin),
		revenueMax: amount(profile?.revenueMax),
		ebitdaMin: amount(profile?.ebitdaMin),
		ebitdaMax: amount(profile?.ebitdaMax),
		purchasePriceMin: amount(profile?.purchasePriceMin),
		purchasePriceMax: amount(profile?.purchasePriceMax),
		ownerInvolvement: profile?.ownerInvolvement ?? null,
		recurringRevenuePreference: profile?.recurringRevenuePreference ?? null,
		customerConcentrationMax: profile?.customerConcentrationMax ?? null,
		assetPreference: profile?.assetPreference ?? null,
		financingAssumptions: profile?.financingAssumptions ?? null,
	};
}

export function acquisitionProfileIsEmpty(
	profile: AcquisitionProfileValues,
): boolean {
	return (
		profile.preferredIndustries.length === 0 &&
		profile.geographies.length === 0 &&
		profile.excludedCategories.length === 0 &&
		profile.revenueMin === null &&
		profile.revenueMax === null &&
		profile.ebitdaMin === null &&
		profile.ebitdaMax === null &&
		profile.purchasePriceMin === null &&
		profile.purchasePriceMax === null &&
		profile.ownerInvolvement === null &&
		profile.recurringRevenuePreference === null &&
		profile.customerConcentrationMax === null &&
		profile.assetPreference === null &&
		profile.financingAssumptions === null
	);
}

export function normalizeAcquisitionList(values: string[]): string[] {
	const seen = new Set<string>();
	return values.flatMap((value) => {
		const normalized = value.trim();
		const key = normalized.toLocaleLowerCase();
		if (!normalized || seen.has(key)) return [];
		seen.add(key);
		return [normalized];
	});
}

export function validateAcquisitionRanges(
	profile: AcquisitionProfileValues,
): string | null {
	for (const [label, minimum, maximum] of [
		["Annual revenue", profile.revenueMin, profile.revenueMax],
		["EBITDA or SDE", profile.ebitdaMin, profile.ebitdaMax],
		["Purchase price", profile.purchasePriceMin, profile.purchasePriceMax],
	] as const) {
		if (minimum !== null && maximum !== null && minimum > maximum) {
			return `${label} maximum must be at least the minimum.`;
		}
	}
	return null;
}

function amount(value: Prisma.Decimal | null | undefined): number | null {
	return value?.toNumber() ?? null;
}
