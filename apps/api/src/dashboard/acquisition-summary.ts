import type { Prisma } from "@crm/db";

export const ACQUISITION_STALE_DAYS = 30;

type Profile = Prisma.AcquisitionProfileGetPayload<object>;

export function visibleCriteriaCount(profile: Profile | null): number {
	if (!profile) return 0;
	return (
		profile.preferredIndustries.length +
		profile.geographies.length +
		profile.excludedCategories.length
	);
}
