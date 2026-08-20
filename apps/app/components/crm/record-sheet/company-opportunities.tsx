"use client";

import Add from "@carbon/icons-react/es/Add";
import Partnership from "@carbon/icons-react/es/Partnership";
import { AcquisitionEngagementStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import {
	AcquisitionEngagementStageIndicator,
	showsAcquisitionEngagementStageMenu,
} from "@/components/crm/acquisition-engagement-stage";
import { AcquisitionEngagementStageMenu } from "@/components/crm/acquisition-engagement-stage-menu";
import { OwnerCell } from "@/components/crm/owner-cell";
import {
	DetailSheetEmpty,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceLabels } from "@/lib/use-workspace-labels";

type Company = RouterOutputs["companies"]["byId"];
type EngagementRow =
	RouterOutputs["acquisition"]["listEngagements"]["rows"][number];

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const COLUMNS = [
	{ header: "Stage", width: "w-[24%]", className: "pl-5" },
	{ header: "Amount", width: "w-[18%]", align: "right" as const },
	{ header: "Expected close", width: "w-[22%]" },
	{ header: "Owner", width: "w-[20%]" },
];

function EngagementRowCells({ engagement }: { engagement: EngagementRow }) {
	return (
		<>
			<TableCell className="px-3 py-2.5 pl-5">
				{showsAcquisitionEngagementStageMenu(engagement.status) ? (
					<AcquisitionEngagementStageMenu
						engagementId={engagement.id}
						stage={engagement.stage}
					/>
				) : (
					<AcquisitionEngagementStageIndicator stage={engagement.stage} />
				)}
			</TableCell>
			<TableCell className="px-3 py-2.5 text-right">
				{engagement.amountCents === null ? (
					<EmptyCellValue />
				) : (
					<span className="tabular-nums">
						{formatMoney(engagement.amountCents, engagement.currency)}
					</span>
				)}
			</TableCell>
			<TableCell className="px-3 py-2.5 text-muted-foreground">
				{engagement.expectedCloseDate ? (
					dateFormat.format(new Date(engagement.expectedCloseDate))
				) : (
					<EmptyCellValue />
				)}
			</TableCell>
			<TableCell className="px-3 py-2.5">
				<OwnerCell owner={engagement.owner} />
			</TableCell>
		</>
	);
}

export function CompanyOpportunities({ company }: { company: Company }) {
	const trpc = useTRPC();
	const labels = useWorkspaceLabels();
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

	const { active, history } = useMemo(() => {
		const rows = engagements.data?.rows ?? [];
		return {
			active: rows.filter((row) => row.status === "ACTIVE"),
			history: rows.filter((row) => row.status === "TERMINAL"),
		};
	}, [engagements.data?.rows]);

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

	if (!company.acquisitionTarget) {
		return null;
	}

	if (engagements.isPending) {
		return null;
	}

	if (active.length === 0 && history.length === 0) {
		return (
			<DetailSheetEmpty
				icon={Partnership}
				title={`No ${labels.dealsLower} yet`}
				description={`Start the acquisition process when ${company.name} is ready to move beyond research.`}
				action={
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
				}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{active.length > 0 ? (
				<DetailSheetSection title="Active opportunity">
					<SimpleTable variant="panel" columns={COLUMNS}>
						{active.map((engagement) => (
							<SimpleTableRow key={engagement.id}>
								<EngagementRowCells engagement={engagement} />
							</SimpleTableRow>
						))}
					</SimpleTable>
				</DetailSheetSection>
			) : (
				<DetailSheetSection title="Active opportunity">
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
						<Icon icon={Add} data-icon="inline-start" />
						Start acquisition process
					</Button>
				</DetailSheetSection>
			)}

			{history.length > 0 ? (
				<DetailSheetSection title="History">
					<SimpleTable variant="panel" columns={COLUMNS}>
						{history.map((engagement) => (
							<SimpleTableRow key={engagement.id}>
								<EngagementRowCells engagement={engagement} />
							</SimpleTableRow>
						))}
					</SimpleTable>
				</DetailSheetSection>
			) : null}
		</div>
	);
}
