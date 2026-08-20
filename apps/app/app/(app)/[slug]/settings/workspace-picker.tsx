"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { workspaceUrl } from "@/lib/workspace-url";

export function WorkspacePicker() {
	const trpc = useTRPC();
	const nameId = useId();
	const workspaces = useQuery(trpc.workspace.list.queryOptions());
	const active = workspaces.data?.find((workspace) => workspace.active);
	const [name, setName] = useState("");

	const switchWorkspace = useMutation(
		trpc.workspace.switch.mutationOptions({
			onSuccess: (workspace) => {
				window.location.assign(workspaceUrl(workspace.slug, "/settings"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const createWorkspace = useMutation(
		trpc.workspace.create.mutationOptions({
			onSuccess: (workspace) => {
				window.location.assign(workspaceUrl(workspace.slug, "/settings"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!workspaces.data || !active) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Your workspaces</CardTitle>
				<CardDescription>
					Choose the workspace this session should use, or add another one.
				</CardDescription>
				<CardAction>
					{switchWorkspace.isPending ? <Spinner /> : null}
				</CardAction>
			</CardHeader>

			<CardContent>
				<FieldGroup>
					<Field>
						<FieldLabel>Active workspace</FieldLabel>
						<Select
							value={active.id}
							onValueChange={(organizationId) => {
								if (organizationId !== active.id) {
									switchWorkspace.mutate({ organizationId });
								}
							}}
							disabled={switchWorkspace.isPending || createWorkspace.isPending}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{workspaces.data.map((workspace) => (
									<SelectItem key={workspace.id} value={workspace.id}>
										{workspace.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<form
						onSubmit={(event) => {
							event.preventDefault();
							createWorkspace.mutate({ name: name.trim(), website: null });
						}}
					>
						<Field>
							<FieldLabel htmlFor={nameId}>Add a workspace</FieldLabel>
							<div className="flex gap-2">
								<Input
									id={nameId}
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Workspace name"
									autoComplete="organization"
									disabled={createWorkspace.isPending}
									required
								/>
								<Button
									type="submit"
									disabled={createWorkspace.isPending || name.trim() === ""}
								>
									{createWorkspace.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Add
								</Button>
							</div>
						</Field>
					</form>
				</FieldGroup>
			</CardContent>
		</Card>
	);
}
