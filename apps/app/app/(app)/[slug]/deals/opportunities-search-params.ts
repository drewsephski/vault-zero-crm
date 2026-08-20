import { createListSearchParams } from "@/components/data-table/list-search-params";

export const opportunitiesSearchParams = createListSearchParams({
	defaultSort: "stageChangedAt",
	defaultDir: "desc",
	tabId: "status",
	facetIds: ["owner", "stage"] as const,
});
