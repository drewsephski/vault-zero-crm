"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { workspaceLabels } from "@/lib/workspace-mode";

export function useWorkspaceLabels() {
	const trpc = useTRPC();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	return workspaceLabels(workspace.data?.mode);
}
