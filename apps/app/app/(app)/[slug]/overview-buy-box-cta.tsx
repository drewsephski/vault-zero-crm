"use client";

import { WorkspaceMode } from "@crm/db/enums";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useTRPC } from "@/lib/trpc/client";
import { overviewParsers } from "./overview-search-params";
import { BuyBoxSummaryAction } from "./settings/buy-box/buy-box-summary";

export function OverviewBuyBoxCtaFallback() {
	return null;
}

export function OverviewBuyBoxCta() {
	const trpc = useTRPC();
	const [scope] = useQueryState("scope", overviewParsers.scope);
	const summary = useQuery(trpc.dashboard.summary.queryOptions({ scope }));

	if (summary.data?.mode !== WorkspaceMode.ACQUISITION) {
		return null;
	}

	return <BuyBoxSummaryAction />;
}
