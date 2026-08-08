import { createListSearchParams } from "@/components/data-table/list-search-params";

export const outreachSearchParams = createListSearchParams({
	defaultSort: "lastContacted",
	defaultDir: "desc",
	facetIds: ["status", "vertical", "owner"] as const,
});
