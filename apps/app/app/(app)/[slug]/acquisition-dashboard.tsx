"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import { StatGroup } from "@crm/ui/components/dashboard";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { StatCard } from "@crm/ui/components/stat-card";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { formatCount, relativeTimeFromIso } from "@crm/ui/lib/format";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Summary = RouterOutputs["dashboard"]["summary"];

const CELL = "px-3 py-2.5 align-middle";

const ACTION_COLUMNS: SimpleTableColumn[] = [
	{ srLabel: "Done", width: "w-8" },
	{ header: "Next action" },
	{ header: "Due", width: "w-24", align: "right" },
];

const OPPORTUNITY_COLUMNS: SimpleTableColumn[] = [
	{ header: "Opportunity" },
	{ header: "Target", width: "w-44", className: "hidden sm:table-cell" },
	{ header: "Last moved", width: "w-24", align: "right" },
];

export function AcquisitionDashboard({ summary }: { summary: Summary }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const openRecord = useOpenRecord();
	const { acquisition, biggestOpen } = summary;

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const fitDescription =
		acquisition.visibleMatches === null
			? "Add industry or geography criteria to compare targets"
			: `${formatCount(acquisition.visibleMatches, "target")} of ${acquisition.totalTargets} match the industry and geography evidence on file`;

	return (
		<div className="order-last flex min-w-0 flex-col gap-6 @5xl/page-content:order-first">
			<StatGroup>
				<StatCard
					label="Buy-box fit"
					value={acquisition.visibleMatches ?? "—"}
					description={fitDescription}
				/>
				<StatCard
					label="Needs research"
					value={acquisition.needsResearch}
					description="Targets without a completed research pass"
				/>
				<StatCard
					label="Next actions"
					value={acquisition.nextActionCount}
					description="Open tasks assigned to you"
				/>
				<StatCard
					label="Stale targets"
					value={acquisition.staleTargets}
					description={`No activity for ${acquisition.staleAfterDays} days`}
				/>
			</StatGroup>

			<div className="grid gap-6 @3xl/page-content:grid-cols-2">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Next actions</CardTitle>
						<CardDescription>
							The five actions closest to a decision
						</CardDescription>
						<CardAction>
							<Button asChild variant="contrast" size="sm">
								<Link href={workspaceUrl("/tasks")}>All tasks</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<CardPanel>
						{acquisition.nextActions.length === 0 ? (
							<CardPanelEmpty>
								No next action is logged. Add one from a target or opportunity.
							</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={ACTION_COLUMNS}
							>
								{acquisition.nextActions.map((task) => (
									<SimpleTableRow key={task.id}>
										<TableCell className={CELL}>
											<Checkbox
												checked={false}
												disabled={complete.isPending}
												aria-label={`Complete ${task.subject ?? "task"}`}
												onCheckedChange={() =>
													complete.mutate({ id: task.id, completed: true })
												}
											/>
										</TableCell>
										<TableCell className={CELL}>
											<span className="flex min-w-0 flex-col">
												<span className="truncate">
													{task.subject ?? "Untitled task"}
												</span>
												<span className="truncate text-muted-foreground">
													<TaskContext task={task} />
												</span>
											</span>
										</TableCell>
										<TableCell className={`${CELL} text-right`}>
											{task.dueAt ? (
												<StatusIndicator
													tone={
														new Date(task.dueAt) < new Date()
															? "error"
															: "neutral"
													}
													label={relativeTimeFromIso(task.dueAt)}
												/>
											) : (
												<EmptyCellValue />
											)}
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Active acquisitions</CardTitle>
						<CardDescription>
							{formatCount(acquisition.activeAcquisitions, "opportunity")} in
							progress
						</CardDescription>
						<CardAction>
							<Button asChild variant="contrast" size="sm">
								<Link href={workspaceUrl("/deals")}>All opportunities</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<CardPanel>
						{biggestOpen.length === 0 ? (
							<CardPanelEmpty>No active acquisitions yet.</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={OPPORTUNITY_COLUMNS}
							>
								{biggestOpen.map((opportunity) => (
									<SimpleTableRow
										key={opportunity.id}
										clickable
										onClick={() =>
											openRecord({ kind: "deal", id: opportunity.id })
										}
									>
										<TableCell className={CELL}>
											<span className="truncate font-medium">
												{opportunity.name}
											</span>
										</TableCell>
										<TableCell className={`${CELL} hidden sm:table-cell`}>
											<RecordLink kind="company" id={opportunity.company.id}>
												{opportunity.company.name}
											</RecordLink>
										</TableCell>
										<TableCell
											className={`${CELL} text-right text-muted-foreground`}
										>
											{relativeTimeFromIso(opportunity.stageChangedAt)}
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>
			</div>
		</div>
	);
}

function TaskContext({
	task,
}: {
	task: Summary["acquisition"]["nextActions"][number];
}) {
	if (task.deal) {
		return (
			<RecordLink kind="deal" id={task.deal.id}>
				{task.deal.name}
			</RecordLink>
		);
	}

	if (task.company) {
		return (
			<RecordLink kind="company" id={task.company.id}>
				{task.company.name}
			</RecordLink>
		);
	}

	if (task.contact) {
		return (
			<RecordLink kind="contact" id={task.contact.id}>
				{[task.contact.firstName, task.contact.lastName]
					.filter(Boolean)
					.join(" ")}
			</RecordLink>
		);
	}

	return null;
}
