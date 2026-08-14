"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { useHydratedValue } from "@/lib/use-hydrated-value";
import { workspaceLabels } from "@/lib/workspace-mode";

export function useHydratedWorkspace() {
	const trpc = useTRPC();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	return useHydratedValue(workspace.data, undefined);
}

export function useWorkspaceLabels() {
	return workspaceLabels(useHydratedWorkspace()?.mode);
}
