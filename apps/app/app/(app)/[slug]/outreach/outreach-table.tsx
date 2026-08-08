"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { StatusIndicator, type StatusTone } from "@crm/ui/components/status-indicator";
import { relativeTimeFromIso } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { outreachSearchParams } from "./outreach-search-params";

type OutreachRow = RouterOutputs["outreach"]["list"]["rows"][number];

const PRESENTATION: Record<OutreachRow["status"], { label: string; tone: StatusTone }> = {
	CONTACTED: { label: "Contacted", tone: "info" },
	REPLIED: { label: "Replied", tone: "success" },
	QUALIFIED: { label: "Qualified", tone: "success" },
	DEMO_BOOKED: { label: "Demo booked", tone: "warning" },
	PILOT: { label: "Pilot", tone: "warning" },
	WON: { label: "Won", tone: "success" },
	LOST: { label: "Lost", tone: "neutral" },
	BOUNCED: { label: "Bounced", tone: "error" },
	OPTED_OUT: { label: "Opted out", tone: "error" },
};

const STATUS_OPTIONS = Object.entries(PRESENTATION).map(([value, option]) => ({
	value,
	label: option.label,
}));

const COLUMNS: DataTableColumn<OutreachRow>[] = [
	{
		id: "company",
		header: "Prospect",
		sortable: true,
		hideable: false,
		width: "w-[27%]",
		cell: (row) => (
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium">{row.companyName}</span>
				<span className="truncate text-muted-foreground">{row.email}</span>
			</span>
		),
	},
	{
		id: "vertical",
		header: "Vertical",
		sortable: true,
		width: "w-[14%]",
		hideBelow: "md",
		cell: (row) => row.vertical ?? <EmptyCellValue />,
	},
	{
		id: "status",
		header: "Status",
		sortable: true,
		width: "w-[15%]",
		cell: (row) => {
			const option = PRESENTATION[row.status];
			return <StatusIndicator tone={option.tone} label={option.label} />;
		},
	},
	{
		id: "messages",
		header: "Touches",
		sortable: true,
		align: "right",
		width: "w-[10%]",
		hideBelow: "lg",
		cell: (row) => <span className="tabular-nums">{row.messageCount}</span>,
	},
	{
		id: "lastContacted",
		header: "Last touch",
		sortable: true,
		align: "right",
		width: "w-[16%]",
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.lastContactedAt)}
			</span>
		),
	},
	{
		id: "response",
		header: "Response",
		align: "right",
		width: "w-[16%]",
		hideBelow: "lg",
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.lastRespondedAt)}
			</span>
		),
	},
];

export function OutreachTable() {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const { query, input } = useTableQuery(outreachSearchParams);
	const outreach = useQuery({
		...trpc.outreach.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());
	const facetCounts = outreach.data?.facetCounts;
	const facets: DataTableFacet[] = [
		{
			id: "status",
			label: "Status",
			options: STATUS_OPTIONS.filter(
				(option) => (facetCounts?.status?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "vertical",
			label: "Vertical",
			options: Object.keys(facetCounts?.vertical ?? {}).map((value) => ({
				value,
				label: value,
			})),
		},
		{
			id: "owner",
			label: "Owner",
			options: (users.data ?? []).map((user) => ({
				value: user.id,
				label: user.name,
			})),
		},
	];

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder="Search prospects, emails or subjects…" />}
			columns={COLUMNS}
			rows={outreach.data?.rows ?? []}
			total={outreach.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			getRowId={(row) => row.id}
			loading={outreach.isFetching}
			onRowClick={(row) => {
				if (row.contact) openRecord({ kind: "contact", id: row.contact.id });
				else if (row.company) openRecord({ kind: "company", id: row.company.id });
			}}
			empty="No outreach prospects match this view."
		/>
	);
}
