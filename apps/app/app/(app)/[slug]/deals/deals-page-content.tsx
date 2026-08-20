"use client";

import { WorkspaceMode } from "@crm/db/enums";
import { useHydratedWorkspace } from "@/lib/use-workspace-labels";
import { CreateDealSheet } from "./create-deal-sheet";
import { CreateEngagementSheet } from "./create-engagement-sheet";
import { DealsTable } from "./deals-table";
import { OpportunitiesTable } from "./opportunities-table";

export function DealsPageCreateAction({ companyId }: { companyId?: string }) {
	const workspace = useHydratedWorkspace();
	if (workspace?.mode === WorkspaceMode.ACQUISITION) {
		return <CreateEngagementSheet companyId={companyId} />;
	}
	return <CreateDealSheet companyId={companyId} />;
}

export function DealsPageTable() {
	const workspace = useHydratedWorkspace();
	if (workspace?.mode === WorkspaceMode.ACQUISITION) {
		return <OpportunitiesTable />;
	}
	return <DealsTable />;
}
