"use client";

import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
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
import { Link as TextLink } from "@crm/ui/components/link";
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
import {
	AcquisitionFitIndicator,
	AcquisitionStageIndicator,
} from "@/components/crm/acquisition-status";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Summary = Extract<
	RouterOutputs["dashboard"]["summary"],
	{ mode: "ACQUISITION" }
>;

const CELL = "px-3 py-2.5 align-middle";

const ACTION_COLUMNS: SimpleTableColumn[] = [
	{ srLabel: "Done", width: "w-8" },
	{ header: "Next action" },
	{ header: "Due", width: "w-24", align: "right" },
];

const OPPORTUNITY_COLUMNS: SimpleTableColumn[] = [
	{ header: "Opportunity" },
	{ header: "Next action", width: "w-28", align: "right" },
];

const TARGET_COLUMNS: SimpleTableColumn[] = [
	{ header: "Target" },
	{ header: "Fit", width: "w-28" },
	{ header: "Research", width: "w-24", align: "right" },
];

const DISCOVERY_COLUMNS: SimpleTableColumn[] = [
	{ header: "Candidate" },
	{
		header: "Evidence",
		width: "w-[42%]",
		className: "hidden sm:table-cell",
	},
	{ srLabel: "Actions", width: "w-28 sm:w-44", align: "right" },
];

export function AcquisitionDashboard({ summary }: { summary: Summary }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const { acquisition } = summary;

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: async () => {
				await cache.activity();
				toast.success("Next action completed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const approveCandidate = useMutation(
		trpc.acquisition.approveCandidate.mutationOptions({
			onSuccess: async () => {
				await cache.everything();
				toast.success("Target added and research queued.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const dismissCandidate = useMutation(
		trpc.acquisition.dismissCandidate.mutationOptions({
			onSuccess: async () => {
				await cache.everything();
				toast.success("Candidate dismissed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const fitDescription =
		acquisition.visibleMatches === null
			? "Add industry or geography criteria to compare targets"
			: `${formatCount(acquisition.visibleMatches, "target")} have an evidence-backed strong or potential fit`;

	return (
		<div className="@container/acquisition-dashboard order-last flex min-w-0 flex-col gap-6 @5xl/page-content:order-first">
			<StatGroup>
				<StatCard
					label="Buy-box fit"
					value={acquisition.visibleMatches ?? "—"}
					description={fitDescription}
				/>
				<StatCard
					label="Needs research"
					value={acquisition.needsResearch}
					description={
						acquisition.activeAgentWork > 0
							? `${formatCount(acquisition.activeAgentWork, "Eve task")} queued or running`
							: "Targets without a completed research pass"
					}
				/>
				<StatCard
					label="Next actions"
					value={acquisition.nextActionCount}
					description={
						acquisition.missingNextActions > 0
							? `${formatCount(acquisition.missingNextActions, "active opportunity")} still need one`
							: "Every active opportunity has one"
					}
				/>
				<StatCard
					label="Stale targets"
					value={acquisition.staleTargets}
					description={`Dossier not refreshed for ${acquisition.staleAfterDays} days`}
				/>
			</StatGroup>

			{acquisition.visibleMatches === null ? (
				<Alert>
					<AlertTitle>Finish the buy box</AlertTitle>
					<AlertDescription>
						Add an industry, geography, or exclusion before the dashboard
						screens targets against your criteria.
					</AlertDescription>
					<AlertAction>
						<Button asChild variant="outline" size="sm">
							<Link href={workspaceUrl("/settings/buy-box")}>Set criteria</Link>
						</Button>
					</AlertAction>
				</Alert>
			) : null}

			<div className="grid gap-6 @5xl/acquisition-dashboard:grid-cols-2">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Targets worth attention</CardTitle>
						<CardDescription>
							The strongest current fit assessments, with Eve's next move
						</CardDescription>
						<CardAction>
							<Button asChild variant="contrast" size="sm">
								<Link href={workspaceUrl("/companies")}>All targets</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<CardPanel>
						{acquisition.priorityTargets.length === 0 ? (
							<CardPanelEmpty>
								No evidence-backed priority target yet. Approve a candidate or
								queue research on an existing target.
							</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={TARGET_COLUMNS}
							>
								{acquisition.priorityTargets.map((target) => (
									<SimpleTableRow key={target.company.id}>
										<TableCell className={CELL}>
											<span className="flex min-w-0 flex-col">
												<RecordLink kind="company" id={target.company.id}>
													{target.company.name}
												</RecordLink>
												<span className="truncate text-muted-foreground">
													{target.recommendedAction ?? target.summary}
												</span>
											</span>
										</TableCell>
										<TableCell className={CELL}>
											<span className="flex flex-col gap-1">
												<AcquisitionFitIndicator fit={target.fit} />
												<AcquisitionStageIndicator stage={target.stage} />
											</span>
										</TableCell>
										<TableCell
											className={`${CELL} text-right text-muted-foreground`}
										>
											{target.researchedAt ? (
												<span suppressHydrationWarning>
													{relativeTimeFromIso(target.researchedAt)}
												</span>
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
						<CardTitle>Discovery review</CardTitle>
						<CardDescription>
							{acquisition.discovery.count === 0
								? "Eve saves credible companies here before they enter the CRM"
								: `${formatCount(acquisition.discovery.count, "candidate")} waiting for a decision`}
						</CardDescription>
					</CardHeader>
					<CardPanel>
						{acquisition.discovery.items.length === 0 ? (
							<CardPanelEmpty>
								Ask Eve to find companies matching the buy box. Nothing becomes
								a target until you approve it.
							</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={DISCOVERY_COLUMNS}
							>
								{acquisition.discovery.items.map((candidate) => {
									const busy =
										(approveCandidate.isPending &&
											approveCandidate.variables?.id === candidate.id) ||
										(dismissCandidate.isPending &&
											dismissCandidate.variables?.id === candidate.id);
									return (
										<SimpleTableRow key={candidate.id}>
											<TableCell className={CELL}>
												<span className="flex min-w-0 flex-col">
													<span className="truncate font-medium">
														{candidate.name}
													</span>
													<span className="truncate text-muted-foreground">
														{candidate.rationale}
													</span>
													<span className="mt-2 flex min-w-0 flex-col gap-1 whitespace-normal sm:hidden">
														<span className="line-clamp-2 break-words">
															{candidate.evidence}
														</span>
														<TextLink
															className="truncate"
															variant="quiet"
															href={candidate.sourceUrl}
															target="_blank"
															rel="noreferrer noopener"
														>
															{candidate.sourceTitle ?? candidate.domain}
														</TextLink>
													</span>
												</span>
											</TableCell>
											<TableCell
												className={`${CELL} hidden whitespace-normal sm:table-cell`}
											>
												<span className="flex min-w-0 flex-col">
													<span className="line-clamp-2 break-words">
														{candidate.evidence}
													</span>
													<TextLink
														className="truncate"
														variant="quiet"
														href={candidate.sourceUrl}
														target="_blank"
														rel="noreferrer noopener"
													>
														{candidate.sourceTitle ?? candidate.domain}
													</TextLink>
												</span>
											</TableCell>
											<TableCell className={`${CELL} text-right`}>
												<span className="flex flex-col items-stretch gap-1 sm:inline-flex sm:flex-row sm:items-center">
													<Button
														variant="ghost"
														size="sm"
														disabled={busy}
														onClick={() =>
															dismissCandidate.mutate({ id: candidate.id })
														}
													>
														Dismiss
													</Button>
													<Button
														size="sm"
														disabled={busy}
														onClick={() =>
															approveCandidate.mutate({ id: candidate.id })
														}
													>
														Add target
													</Button>
												</span>
											</TableCell>
										</SimpleTableRow>
									);
								})}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>
			</div>

			<div className="grid gap-6 @5xl/acquisition-dashboard:grid-cols-2">
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
												disabled={
													complete.isPending &&
													complete.variables?.id === task.id
												}
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
						{acquisition.activeOpportunities.length === 0 ? (
							<CardPanelEmpty>No active acquisitions yet.</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={OPPORTUNITY_COLUMNS}
							>
								{acquisition.activeOpportunities.map((opportunity) => (
									<SimpleTableRow key={opportunity.id}>
										<TableCell className={CELL}>
											<span className="flex min-w-0 flex-col">
												<RecordLink kind="deal" id={opportunity.id}>
													{opportunity.name}
												</RecordLink>
												<span className="flex min-w-0 gap-1 text-muted-foreground">
													<RecordLink
														kind="company"
														id={opportunity.company.id}
													>
														{opportunity.company.name}
													</RecordLink>
													<span aria-hidden>·</span>
													<span className="truncate">
														Moved{" "}
														{relativeTimeFromIso(opportunity.stageChangedAt)}
													</span>
												</span>
											</span>
										</TableCell>
										<TableCell className={`${CELL} text-right`}>
											<StatusIndicator
												tone={opportunity.hasNextAction ? "neutral" : "warning"}
												label={
													opportunity.hasNextAction ? "Planned" : "Missing"
												}
											/>
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
