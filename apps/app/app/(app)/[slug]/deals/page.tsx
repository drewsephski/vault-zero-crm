import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
} from "@/components/page-shell";
import { WorkspaceSectionHeading } from "@/components/workspace-section-heading";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { workspaceLabels } from "@/lib/workspace-mode";
import { DealsPageCreateAction, DealsPageTable } from "./deals-page-content";
import { dealsSearchParams } from "./deals-search-params";
import {
	acquisitionEngagementListInput,
	opportunitiesSearchParams,
} from "./opportunities-search-params";

export const metadata: Metadata = {
	title: "Deals",
};

export default function DealsPage({
	searchParams,
}: PageProps<"/[slug]/deals">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<WorkspaceSectionHeading section="deals" />
				</PageShellHeading>
				<PageShellActions>
					<DealsPageCreateAction />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Deals searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Deals({
	searchParams,
}: Pick<PageProps<"/[slug]/deals">, "searchParams">) {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const workspace = await queryClient.fetchQuery(
		trpc.workspace.get.queryOptions(),
	);
	const labels = workspaceLabels(workspace.mode);

	if (labels.acquisition) {
		const values = await opportunitiesSearchParams.load(searchParams);
		await Promise.all([
			queryClient.prefetchQuery(
				trpc.acquisition.listEngagements.queryOptions(
					acquisitionEngagementListInput(
						opportunitiesSearchParams.toInput(values),
					),
				),
			),
			queryClient.prefetchQuery(trpc.workspace.get.queryOptions()),
		]);
		void queryClient.prefetchQuery(trpc.users.list.queryOptions());
		void queryClient.prefetchQuery(
			trpc.acquisition.engagementTargetOptions.queryOptions({ q: "" }),
		);
	} else {
		const values = await dealsSearchParams.load(searchParams);
		await Promise.all([
			queryClient.prefetchQuery(
				trpc.deals.list.queryOptions(dealsSearchParams.toInput(values)),
			),
			queryClient.prefetchQuery(trpc.workspace.get.queryOptions()),
		]);
		void queryClient.prefetchQuery(trpc.users.list.queryOptions());
		void queryClient.prefetchQuery(
			trpc.companies.options.queryOptions({ q: "" }),
		);
	}

	return (
		<HydrateClient>
			<DealsPageTable />
		</HydrateClient>
	);
}
