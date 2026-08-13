import type { AcquisitionTargetView } from "@crm/db/acquisition";
import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { createListSearchParams } from "@/components/data-table/list-search-params";

const TARGET_VIEW_VALUES = ["all", "rejected", "acquired", "history"] as const;

const base = createListSearchParams({
	defaultSort: "createdAt",
	defaultDir: "desc",
	tabId: "targetView",
	facetIds: ["owner", "industry", "enrichment"] as const,
});

const parsers = {
	...base.parsers,
	targetView: parseAsStringLiteral(TARGET_VIEW_VALUES).withDefault("all"),
} as typeof base.parsers;

const toInput = (values: Parameters<typeof base.toInput>[0]) => {
	const input = base.toInput(values);
	return {
		...input,
		targetView: (input.targetView === "all"
			? "active"
			: input.targetView) as AcquisitionTargetView,
	};
};

export const companiesSearchParams = {
	...base,
	parsers,
	load: createLoader(parsers),
	toInput,
	defaultInput: () => toInput(base.defaultInput()),
};
