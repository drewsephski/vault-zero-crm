import { AcquisitionEngagementStage } from "@crm/db/enums";
import { createListSearchParams } from "@/components/data-table/list-search-params";

export const opportunitiesSearchParams = createListSearchParams({
	defaultSort: "stageChangedAt",
	defaultDir: "desc",
	tabId: "status",
	facetIds: ["owner", "stage"] as const,
});

export function acquisitionEngagementListInput(
	input: ReturnType<typeof opportunitiesSearchParams.toInput>,
) {
	const stages = Object.values(AcquisitionEngagementStage) as string[];
	const status: "all" | "active" | "terminal" =
		input.status === "active" || input.status === "terminal"
			? input.status
			: "all";
	return {
		...input,
		status,
		stage: stages.includes(input.stage)
			? (input.stage as AcquisitionEngagementStage)
			: ("all" as const),
	};
}
