"use client";

import { WorkspaceMode } from "@crm/db/enums";
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
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function WorkflowModeForm() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const fieldId = useId();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const [draft, setDraft] = useState<WorkspaceMode | null>(null);

	const save = useMutation(
		trpc.workspace.setMode.mutationOptions({
			onSuccess: async (result) => {
				await cache.workspace();
				setDraft(null);
				toast.success(
					result.mode === WorkspaceMode.ACQUISITION
						? result.discoveryQueued
							? "Acquisition mode saved. Eve is finding an initial candidate set."
							: "Acquisition mode saved. Add an industry or geography to start discovery."
						: "Sales mode saved.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (workspace.isError && !workspace.data) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Could not load workflow settings</AlertTitle>
				<AlertDescription>{workspace.error.message}</AlertDescription>
				<AlertAction>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void workspace.refetch()}
					>
						Try again
					</Button>
				</AlertAction>
			</Alert>
		);
	}

	if (!workspace.data) {
		return (
			<div aria-busy="true" className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const value = draft ?? workspace.data.mode;
	const acquisition = value === WorkspaceMode.ACQUISITION;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Workflow</CardTitle>
				<CardDescription>
					Choose the language and overview that match how this workspace
					operates.
				</CardDescription>
				<CardAction>
					<Button
						disabled={
							!workspace.data.canManageAcquisition ||
							save.isPending ||
							value === workspace.data.mode
						}
						onClick={() => save.mutate({ mode: value })}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={fieldId}>Mode</FieldLabel>
						<Select
							value={value}
							onValueChange={(next) => setDraft(next as WorkspaceMode)}
							disabled={!workspace.data.canManageAcquisition || save.isPending}
						>
							<SelectTrigger id={fieldId}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={WorkspaceMode.SALES}>Sales CRM</SelectItem>
								<SelectItem value={WorkspaceMode.ACQUISITION}>
									Acquisition CRM
								</SelectItem>
							</SelectContent>
						</Select>
						<FieldDescription>
							{acquisition
								? "Companies become targets, deals become opportunities, and the overview leads with screening and next actions."
								: "Use sales terminology, pipeline value, win rate, and revenue reporting."}
						</FieldDescription>
					</Field>
				</FieldGroup>

				{workspace.data.mode === WorkspaceMode.ACQUISITION ? (
					<p className="text-muted-foreground text-xs">
						Define the acquisition criteria in your{" "}
						<Link
							href={workspaceUrl("/settings/buy-box")}
							className="underline"
						>
							buy box
						</Link>
						.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
