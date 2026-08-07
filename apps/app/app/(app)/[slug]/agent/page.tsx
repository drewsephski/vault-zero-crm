import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AgentWorkspace } from "./agent-workspace";

export const metadata: Metadata = {
	title: "Agent",
};

export default function AgentPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Agent</PageShellTitle>
					<PageShellDescription>
						Ask across your CRM, continue recent conversations, or see what
						needs attention.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Agent />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Agent() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.conversations.list.queryOptions({ scope: "workspace" }),
	);

	return (
		<HydrateClient>
			<AgentWorkspace />
		</HydrateClient>
	);
}
