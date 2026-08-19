import type { Prisma } from "@crm/db";
import { configuredCriteriaCount } from "@crm/db/acquisition";

export const ACQUISITION_STALE_DAYS = 30;

export const PRIORITY_TARGET_QUERY_CAP = 12;

export const PRIORITY_TARGET_DISPLAY_LIMIT = 6;

type Profile = Prisma.AcquisitionProfileGetPayload<object>;

export function visibleCriteriaCount(profile: Profile | null): number {
	if (!profile) return 0;
	return configuredCriteriaCount(profile);
}
