"use client";

import { AcquisitionEngagementStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import {
	AcquisitionEngagementStageIndicator,
	showsAcquisitionEngagementStageMenu,
} from "@/components/crm/acquisition-engagement-stage";
import { AcquisitionEngagementStageMenu } from "@/components/crm/acquisition-engagement-stage-menu";
import { DetailSheetSection } from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Company = RouterOutputs["companies"]["byId"];

export function TargetOpportunitySection({ company }: { company: Company }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const idempotencyKey = useRef(crypto.randomUUID());

	const engagements = useQuery(
		trpc.acquisition.listEngagements.queryOptions({
			companyId: company.id,
			status: "all",
			q: "",
			sort: "stageChangedAt",
			dir: "desc",
			page: 1,
			pageSize: 100,
			owner: "all",
			stage: "all",
		}),
	);

	const active = engagements.data?.rows.find((row) => row.status === "ACTIVE");
	const history = engagements.data?.rows.filter(
		(row) => row.status === "TERMINAL",
	);

	const create = useMutation(
		trpc.acquisition.createEngagement.mutationOptions({
			onSuccess: async () => {
				await cache.engagement(company.id);
				toast.success("Opportunity opened.");
				idempotencyKey.current = crypto.randomUUID();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!company.acquisitionTarget || engagements.isPending) {
		return null;
	}

	if (active) {
		return (
			<DetailSheetSection title="Active opportunity">
				<div className="flex flex-wrap items-center gap-3">
					{showsAcquisitionEngagementStageMenu(active.status) ? (
						<AcquisitionEngagementStageMenu
							engagementId={active.id}
							stage={active.stage}
							variant="control"
						/>
					) : (
						<AcquisitionEngagementStageIndicator stage={active.stage} />
					)}
					{history && history.length > 0 ? (
						<span className="text-sm text-muted-foreground">
							{history.length} closed{" "}
							{history.length === 1 ? "opportunity" : "opportunities"}
						</span>
					) : null}
				</div>
			</DetailSheetSection>
		);
	}

	return (
		<DetailSheetSection title="Opportunity">
			<Button
				variant="outline"
				size="sm"
				disabled={create.isPending}
				onClick={() =>
					create.mutate({
						companyId: company.id,
						idempotencyKey: idempotencyKey.current,
						stage: AcquisitionEngagementStage.OUTREACH,
					})
				}
			>
				Start acquisition process
			</Button>
		</DetailSheetSection>
	);
}
