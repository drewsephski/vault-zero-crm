"use client";

import type { AcquisitionTargetView } from "@crm/db/acquisition";
import { AcquisitionFit, AcquisitionStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { relativeTimeFromIso } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	AcquisitionFitIndicator,
	AcquisitionStageIndicator,
} from "@/components/crm/acquisition-status";
import { BulkRecordActions } from "@/components/crm/bulk-record-actions";
import {
	ENRICHMENT_FACET_OPTIONS,
	ENRICHMENT_POLL_MS,
	EnrichmentIndicator,
	isEnriching,
} from "@/components/crm/enrichment-status";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceLabels } from "@/lib/use-workspace-labels";
import { companiesSearchParams } from "./companies-search-params";

type CompanyRow = RouterOutputs["companies"]["list"]["rows"][number];

type AcquisitionTargetCellTarget = Pick<
	CompanyRow,
	"id" | "name" | "iconUrl" | "iconDarkUrl" | "iconTone" | "logoUrl"
>;

export function AcquisitionTargetCell({
	target,
	onOpen,
}: {
	target: AcquisitionTargetCellTarget;
	onOpen: (companyId: string) => void;
}) {
	return (
		<Button
			type="button"
			variant="link"
			size="sm"
			aria-label={`Open ${target.name} acquisition dossier`}
			onClick={(event) => {
				event.stopPropagation();
				onOpen(target.id);
			}}
		>
			<EntityLogo
				src={target.iconUrl ?? target.logoUrl}
				darkSrc={target.iconDarkUrl}
				tone={target.iconTone as EntityLogoTone | null | undefined}
				name={target.name}
				size="sm"
			/>
			<span>{target.name}</span>
		</Button>
	);
}

const COLUMNS: DataTableColumn<CompanyRow>[] = [
	{
		id: "name",
		header: "Company",
		sortable: true,
		hideable: false,
		width: "w-[26%]",
		cell: (row) => (
			<span className="flex min-w-0 items-center gap-2.5">
				<EntityLogo
					src={row.iconUrl ?? row.logoUrl}
					darkSrc={row.iconDarkUrl}
					tone={row.iconTone as EntityLogoTone | null | undefined}
					name={row.name}
					size="sm"
				/>
				<span className="truncate font-medium">{row.name}</span>
			</span>
		),
	},
	{
		id: "domain",
		header: "Domain",
		sortable: true,
		width: "w-[16%]",
		hideBelow: "md",
		cell: (row) =>
			row.domain ? (
				<span className="truncate text-muted-foreground">{row.domain}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "industry",
		header: "Industry",
		sortable: true,
		width: "w-[16%]",
		hideBelow: "lg",
		cell: (row) =>
			row.industry ? (
				<span className="truncate">{row.industry}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "owner",
		header: "Owner",
		sortable: true,
		width: "w-[16%]",
		hideBelow: "md",
		cell: (row) => <OwnerCell owner={row.owner} />,
	},
	{
		id: "contacts",
		header: "Contacts",
		sortable: true,
		align: "right",
		width: "w-[9%]",
		hideBelow: "lg",
		cell: (row) => <span className="tabular-nums">{row.contactCount}</span>,
	},
	{
		id: "deals",
		header: "Open deals",
		sortable: true,
		align: "right",
		width: "w-[9%]",
		cell: (row) => <span className="tabular-nums">{row.openDealCount}</span>,
	},
	{
		id: "createdAt",
		header: "Created",
		label: "Created date",
		sortable: true,
		align: "right",
		width: "w-[10%]",
		defaultHidden: true,
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.createdAt)}
			</span>
		),
	},
	{
		id: "lastActivity",
		header: "Last activity",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		hideBelow: "sm",
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.lastActivityAt)}
			</span>
		),
	},
	{
		id: "enrichment",
		header: "Enrichment",
		label: "Enrichment status",
		defaultHidden: true,
		width: "w-[14%]",
		cell: (row) => (
			<EnrichmentIndicator status={row.enrichmentStatus} queued={row.queued} />
		),
	},
];

const FIT_COLUMN: DataTableColumn<CompanyRow> = {
	id: "fit",
	header: "Fit",
	width: "w-[12%]",
	cell: (row) => (
		<AcquisitionFitIndicator
			fit={row.acquisitionTarget?.fit ?? AcquisitionFit.UNKNOWN}
		/>
	),
};

const STAGE_COLUMN: DataTableColumn<CompanyRow> = {
	id: "stage",
	header: "Lifecycle",
	width: "w-[12%]",
	cell: (row) => (
		<AcquisitionStageIndicator
			stage={row.acquisitionTarget?.stage ?? AcquisitionStage.DISCOVERED}
		/>
	),
};

const NEXT_ACTION_COLUMN: DataTableColumn<CompanyRow> = {
	id: "nextAction",
	header: "Recommended next action",
	width: "w-[24%]",
	hideBelow: "md",
	cell: (row) =>
		row.acquisitionTarget?.recommendedAction ? (
			<span className="line-clamp-2">
				{row.acquisitionTarget.recommendedAction}
			</span>
		) : (
			<EmptyCellValue />
		),
};

const RESEARCH_COLUMN: DataTableColumn<CompanyRow> = {
	id: "researchedAt",
	header: "Last successful research",
	width: "w-[16%]",
	hideBelow: "lg",
	cell: (row) =>
		row.acquisitionTarget?.researchedAt ? (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.acquisitionTarget.researchedAt)}
			</span>
		) : (
			<EmptyCellValue />
		),
};

const ACQUISITION_OWNER_COLUMN: DataTableColumn<CompanyRow> = {
	id: "owner",
	header: "Owner",
	sortable: true,
	width: "w-[16%]",
	hideBelow: "sm",
	cell: (row) => <OwnerCell owner={row.owner} />,
};

export function CompaniesTable() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const labels = useWorkspaceLabels();
	const prefetchRecord = usePrefetchRecord();
	const { query, input } = useTableQuery(companiesSearchParams);
	const listInput = {
		...input,
		targetView: input.targetView as AcquisitionTargetView,
	};
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const selected = useMemo(() => [...selectedIds], [selectedIds]);
	const columns = useMemo(() => {
		const base = COLUMNS.map((column) =>
			column.id === "name"
				? { ...column, header: labels.company }
				: column.id === "deals"
					? { ...column, header: `Open ${labels.dealsLower}` }
					: column,
		);

		if (!labels.acquisition) return base;

		return [
			{
				...(base[0] as DataTableColumn<CompanyRow>),
				header: "Target",
				width: "w-[26%]",
				cell: (row: CompanyRow) => (
					<AcquisitionTargetCell
						target={row}
						onOpen={(companyId) =>
							openRecord({ kind: "company", id: companyId })
						}
					/>
				),
			},
			FIT_COLUMN,
			STAGE_COLUMN,
			NEXT_ACTION_COLUMN,
			RESEARCH_COLUMN,
			ACQUISITION_OWNER_COLUMN,
		];
	}, [labels, openRecord]);

	const companies = useQuery({
		...trpc.companies.list.queryOptions(listInput),
		placeholderData: (previous) => previous,
		refetchInterval: (query) =>
			query.state.data?.rows.some((row) =>
				isEnriching(row.enrichmentStatus, row.queued),
			)
				? ENRICHMENT_POLL_MS
				: false,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const facetCounts = companies.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: "Owner",
			options: [
				{ value: "unassigned", label: "Unassigned" },
				...(users.data ?? []).map((user) => ({
					value: user.id,
					label: user.name,
				})),
			].filter((option) => (facetCounts?.owner?.[option.value] ?? 0) > 0),
		},
		{
			id: "industry",
			label: "Industry",
			options: Object.keys(facetCounts?.industry ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "enrichment",
			label: "Enrichment",
			options: ENRICHMENT_FACET_OPTIONS.filter(
				(option) => (facetCounts?.enrichment?.[option.value] ?? 0) > 0,
			),
		},
	];

	return (
		<DataTable
			query={query}
			search={
				<ListSearch
					placeholder={`Search ${labels.companiesLower} by name or domain…`}
				/>
			}
			columns={columns}
			rows={companies.data?.rows ?? []}
			total={companies.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			tabs={
				labels.acquisition
					? {
							id: "targetView",
							allLabel: "Active",
							options: [
								{ value: "rejected", label: "Rejected" },
								{ value: "acquired", label: "Acquired" },
								{ value: "history", label: "History" },
							],
						}
					: undefined
			}
			selection={{
				selectedIds,
				onSelectedIdsChange: setSelectedIds,
				getRowLabel: (row) => row.name,
			}}
			leadingActions={
				<BulkRecordActions
					kind="company"
					ids={selected}
					users={users.data ?? []}
					onClear={() => setSelectedIds(new Set())}
				/>
			}
			getRowId={(row) => row.id}
			loading={companies.isFetching}
			error={companies.error?.message ?? null}
			onRetry={() => void companies.refetch()}
			onRowHover={(row) => prefetchRecord({ kind: "company", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "company", id: row.id })}
			empty={`No ${labels.companiesLower} match this view.`}
		/>
	);
}
