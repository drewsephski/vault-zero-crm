"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { formatDay } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

const WINDOWS = ["today", "overdue", "upcoming", "all"] as const;

type TaskWindow = (typeof WINDOWS)[number];
type Task = RouterOutputs["activities"]["myTasks"][number];

const COLUMNS: SimpleTableColumn[] = [
	{ srLabel: "Done", width: "w-8" },
	{ header: "Task" },
	{
		header: "Related record",
		width: "w-52",
		className: "hidden md:table-cell",
	},
	{ header: "Due", width: "w-28", align: "right" },
];

const CELL = "px-3 py-2.5 align-middle";

export function TasksTable() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const timezoneOffset = new Date().getTimezoneOffset();
	const [window, setWindow] = useQueryState(
		"window",
		parseAsStringLiteral(WINDOWS).withDefault("today"),
	);

	const tasks = useQuery({
		...trpc.activities.myTasks.queryOptions({
			window,
			limit: 100,
			timezoneOffset,
		}),
		placeholderData: (previous) => previous,
	});

	const counts = useQuery(
		trpc.activities.taskCounts.queryOptions({ timezoneOffset }),
	);

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!tasks.data || !counts.data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<Card className="min-h-0">
			<CardHeader>
				<CardTitle>Your next actions</CardTitle>
				<CardDescription>
					Tasks without a due date remain in All until you schedule or complete
					them.
				</CardDescription>
			</CardHeader>

			<Tabs
				value={window}
				onValueChange={(value) => void setWindow(value as TaskWindow)}
			>
				<TabsList aria-label="Task window">
					{WINDOWS.map((value) => (
						<TabsTrigger key={value} value={value}>
							{windowLabel(value)}
							<span className="tabular-nums text-muted-foreground">
								{counts.data[value]}
							</span>
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<CardPanel size="fill">
				{tasks.data.length === 0 ? (
					<CardPanelEmpty>{emptyMessage(window)}</CardPanelEmpty>
				) : (
					<SimpleTable variant="panel" surface="page" columns={COLUMNS}>
						{tasks.data.map((task) => (
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
										<span className="truncate font-medium">
											{task.subject ?? "Untitled task"}
										</span>
										{task.body ? (
											<span className="truncate text-muted-foreground">
												{task.body}
											</span>
										) : null}
									</span>
								</TableCell>
								<TableCell className={`${CELL} hidden md:table-cell`}>
									<TaskContext task={task} />
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									{task.dueAt ? (
										<StatusIndicator
											tone={window === "overdue" ? "error" : "neutral"}
											label={formatDay(task.dueAt)}
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
	);
}

function TaskContext({ task }: { task: Task }) {
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

	return <EmptyCellValue />;
}

function windowLabel(window: TaskWindow): string {
	return {
		today: "Today",
		overdue: "Overdue",
		upcoming: "Upcoming",
		all: "All",
	}[window];
}

function emptyMessage(window: TaskWindow): string {
	return {
		today: "Nothing due today.",
		overdue: "Nothing overdue.",
		upcoming: "Nothing scheduled after today.",
		all: "No open tasks. Add a next action from any record.",
	}[window];
}
