import type { AcquisitionTargetView } from "@crm/db/acquisition";
import { createListSearchParams } from "@/components/data-table/list-search-params";

const TARGET_VIEWS: readonly AcquisitionTargetView[] = [
	"active",
	"rejected",
	"acquired",
	"history",
];

const base = createListSearchParams({
	defaultSort: "createdAt",
	defaultDir: "desc",
	tabId: "targetView",
	facetIds: ["owner", "industry", "enrichment"] as const,
});

const toInput = (values: Parameters<typeof base.toInput>[0]) => {
	const input = base.toInput(values);
	return {
		...input,
		targetView: TARGET_VIEWS.includes(input.targetView as AcquisitionTargetView)
			? (input.targetView as AcquisitionTargetView)
			: "active",
	};
};

export const companiesSearchParams = {
	...base,
	toInput,
	defaultInput: () => toInput(base.defaultInput()),
};
