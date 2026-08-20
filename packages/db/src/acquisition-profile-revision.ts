import type { Db } from "./client";
import type { Prisma } from "./generated/prisma/client";

type DecimalValue = { toString(): string } | number | string | null;

export type AcquisitionProfileRevisionFields = {
	preferredIndustries: string[];
	geographies: string[];
	excludedCategories: string[];
	currency: string;
	revenueMin: DecimalValue;
	revenueMax: DecimalValue;
	ebitdaMin: DecimalValue;
	ebitdaMax: DecimalValue;
	purchasePriceMin: DecimalValue;
	purchasePriceMax: DecimalValue;
	ownerInvolvement: string | null;
	recurringRevenuePreference: string | null;
	customerConcentrationMax: number | null;
	assetPreference: string | null;
	financingAssumptions: string | null;
};

export function acquisitionProfileChanged(
	current: AcquisitionProfileRevisionFields | null,
	next: AcquisitionProfileRevisionFields,
): boolean {
	if (!current) return true;
	return profileFingerprint(current) !== profileFingerprint(next);
}

export async function withAcquisitionProfileLock<T>(
	database: Db,
	organizationId: string,
	update: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
	return database.$transaction(async (tx) => {
		const organizations = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id FROM "organization" WHERE id = ${organizationId} FOR UPDATE
		`;
		if (organizations.length !== 1) {
			throw new Error("The workspace no longer exists.");
		}
		return update(tx);
	});
}

function profileFingerprint(profile: AcquisitionProfileRevisionFields): string {
	return JSON.stringify({
		preferredIndustries: normalizedList(profile.preferredIndustries),
		geographies: normalizedList(profile.geographies),
		excludedCategories: normalizedList(profile.excludedCategories),
		currency: profile.currency.trim().toUpperCase(),
		revenueMin: decimal(profile.revenueMin),
		revenueMax: decimal(profile.revenueMax),
		ebitdaMin: decimal(profile.ebitdaMin),
		ebitdaMax: decimal(profile.ebitdaMax),
		purchasePriceMin: decimal(profile.purchasePriceMin),
		purchasePriceMax: decimal(profile.purchasePriceMax),
		ownerInvolvement: profile.ownerInvolvement,
		recurringRevenuePreference: profile.recurringRevenuePreference,
		customerConcentrationMax: profile.customerConcentrationMax,
		assetPreference: profile.assetPreference,
		financingAssumptions: profile.financingAssumptions?.trim() || null,
	});
}

function normalizedList(values: string[]): string[] {
	return [
		...new Set(
			values.map((value) => value.trim().toLowerCase()).filter(Boolean),
		),
	].sort();
}

function decimal(value: DecimalValue): string | null {
	return value === null ? null : value.toString();
}
