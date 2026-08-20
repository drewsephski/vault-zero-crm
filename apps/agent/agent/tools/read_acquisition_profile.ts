import { db, getOrganizationId } from "@crm/db";
import { z } from "zod";
import {
	ACQUISITION_PROFILE_SELECT,
	acquisitionProfileIsEmpty,
	acquisitionProfileValues,
} from "../lib/acquisition-profile";
import { CRM, enabled, unavailableCapability } from "../lib/capabilities";
import { defineTool } from "../lib/tool";

export default defineTool({
	description:
		"Read the workspace's structured acquisition buy box and report whether it is empty. Call this before answering any request about a buy box, acquisition criteria, acquisition targets, target fit, or acquisition discovery.",
	inputSchema: z.object({}),
	async execute() {
		if (!(await enabled(CRM))) return unavailableCapability("CRM database");

		try {
			const organizationId = getOrganizationId();
			if (!organizationId) {
				return {
					available: false as const,
					reason: "This session is not attached to a workspace.",
				};
			}

			const profile = await db.acquisitionProfile.findUnique({
				where: { id: organizationId },
				select: ACQUISITION_PROFILE_SELECT,
			});
			const values = acquisitionProfileValues(profile);

			return {
				available: true as const,
				mode: profile?.mode ?? null,
				empty: acquisitionProfileIsEmpty(values),
				profile: values,
			};
		} catch (error) {
			console.error("[agent] could not read the acquisition profile", error);
			return {
				available: false as const,
				reason: "The acquisition profile could not be read.",
			};
		}
	},
});
