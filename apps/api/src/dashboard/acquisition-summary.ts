import type { Prisma } from "@crm/db";

export const ACQUISITION_STALE_DAYS = 30;

type Profile = Prisma.AcquisitionProfileGetPayload<object>;

export function visibleFitWhere(
	profile: Profile | null,
	targetWhere: Prisma.CompanyWhereInput,
): Prisma.CompanyWhereInput | null {
	if (!profile || visibleCriteriaCount(profile) === 0) return null;

	const clauses: Prisma.CompanyWhereInput[] = [targetWhere];

	if (profile.preferredIndustries.length > 0) {
		clauses.push({
			OR: profile.preferredIndustries.flatMap((industry) => [
				{ industry: { contains: industry, mode: "insensitive" } },
				{ subIndustry: { contains: industry, mode: "insensitive" } },
			]),
		});
	}

	if (profile.geographies.length > 0) {
		clauses.push({
			OR: profile.geographies.flatMap((geography) => [
				{ city: { contains: geography, mode: "insensitive" } },
				{ stateCode: { contains: geography, mode: "insensitive" } },
				{ country: { contains: geography, mode: "insensitive" } },
				{ countryCode: { contains: geography, mode: "insensitive" } },
			]),
		});
	}

	if (profile.excludedCategories.length > 0) {
		clauses.push({
			NOT: {
				OR: profile.excludedCategories.flatMap((category) => [
					{ industry: { contains: category, mode: "insensitive" } },
					{ subIndustry: { contains: category, mode: "insensitive" } },
				]),
			},
		});
	}

	return { AND: clauses };
}

export function visibleCriteriaCount(profile: Profile | null): number {
	if (!profile) return 0;
	return (
		profile.preferredIndustries.length +
		profile.geographies.length +
		profile.excludedCategories.length
	);
}

export function emptyAcquisitionSummary() {
	return {
		totalTargets: 0,
		visibleMatches: null,
		visibleCriteria: 0,
		needsResearch: 0,
		staleTargets: 0,
		staleAfterDays: ACQUISITION_STALE_DAYS,
		activeAcquisitions: 0,
		nextActionCount: 0,
		nextActions: [],
	};
}
