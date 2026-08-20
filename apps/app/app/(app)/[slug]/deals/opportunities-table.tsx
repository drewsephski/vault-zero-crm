"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { formatMoney, relativeTimeFromIso } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import {
	ACQUISITION_ENGAGEMENT_STAGE_OPTIONS,
	AcquisitionEngagementStageIndicator,
	showsAcquisitionEngagementStageMenu,
} from "@/components/crm/acquisition-engagement-stage";
import { AcquisitionEngagementStageMenu } from "@/components/crm/acquisition-engagement-stage-menu";
import { CompanyCell } from "@/components/crm/company-cell";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceLabels } from "@/lib/use-workspace-labels";
import { opportunitiesSearchParams } from "./opportunities-search-params";

type EngagementRow =
	RouterOutputs["acquisition"]["listEngagements"]["rows"][number];

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const COLUMNS: DataTableColumn<EngagementRow>[] = [
	{
		id: "company",
		header: "Target",
		sortable: true,
		hideable: false,
		width: "w-[24%]",
		cell: (row) => <CompanyCell company={row.company} />,
	},
	{
		id: "stage",
		header: "Stage",
		sortable: true,
		width: "w-[18%]",
		cell: (row) =>
			showsAcquisitionEngagementStageMenu(row.status) ? (
				<AcquisitionEngagementStageMenu
					engagementId={row.id}
					stage={row.stage}
				/>
			) : (
				<AcquisitionEngagementStageIndicator stage={row.stage} />
			),
	},
	{
		id: "owner",
		header: "Owner",
		sortable: true,
		width: "w-[14%]",
		hideBelow: "md",
		cell: (row) => <OwnerCell owner={row.owner} />,
	},
	{
		id: "amount",
		header: "Amount",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		hideBelow: "sm",
		cell: (row) =>
			row.amountCents === null ? (
				<EmptyCellValue />
			) : (
				<span className="tabular-nums">
					{formatMoney(row.amountCents, row.currency)}
				</span>
			),
	},
	{
		id: "expectedCloseDate",
		header: "Expected close",
		sortable: true,
		width: "w-[14%]",
		hideBelow: "lg",
		cell: (row) =>
			row.expectedCloseDate ? (
				<span className="text-muted-foreground">
					{dateFormat.format(new Date(row.expectedCloseDate))}
				</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "stageChangedAt",
		header: "Last moved",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.stageChangedAt)}
			</span>
		),
	},
];

export function OpportunitiesTable() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const labels = useWorkspaceLabels();
	const prefetchRecord = usePrefetchRecord();
	const { query, input } = useTableQuery(opportunitiesSearchParams);

	const engagements = useQuery({
		...trpc.acquisition.listEngagements.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const facetCounts = engagements.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: "Owner",
			options: (users.data ?? [])
				.map((user) => ({ value: user.id, label: user.name }))
				.filter((option) => (facetCounts?.owner?.[option.value] ?? 0) > 0),
		},
		{
			id: "stage",
			label: "Stage",
			options: ACQUISITION_ENGAGEMENT_STAGE_OPTIONS.filter(
				(option) => (facetCounts?.stage?.[option.value] ?? 0) > 0,
			),
		},
	];

	return (
		<DataTable
			query={query}
			search={
				<ListSearch
					placeholder={`Search ${labels.dealsLower} by target name…`}
				/>
			}
			columns={COLUMNS.map((column) =>
				column.id === "company"
					? { ...column, header: labels.company }
					: column,
			)}
			rows={engagements.data?.rows ?? []}
			total={engagements.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			tabs={{
				id: "status",
				allLabel: `All ${labels.dealsLower}`,
				options: [
					{ value: "active", label: "Active" },
					{ value: "terminal", label: "Closed / History" },
				],
			}}
			getRowId={(row) => row.id}
			loading={engagements.isFetching}
			error={engagements.error?.message ?? null}
			onRetry={() => void engagements.refetch()}
			onRowHover={(row) =>
				prefetchRecord({ kind: "company", id: row.company.id })
			}
			onRowClick={(row) => openRecord({ kind: "company", id: row.company.id })}
			empty={`No ${labels.dealsLower} match this view.`}
			meta={
				<span>
					{engagements.data?.total ?? 0} {labels.dealsLower}
				</span>
			}
		/>
	);
}
