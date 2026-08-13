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
import { companiesSearchParams } from "./companies-search-params";
import { CompaniesTable } from "./companies-table";
import { CreateCompanySheet } from "./create-company-sheet";

export async function generateMetadata(): Promise<Metadata> {
	await requireSession();
	const workspace = await getServerQueryClient().fetchQuery(
		getServerTrpc().workspace.get.queryOptions(),
	);
	return { title: workspaceLabels(workspace.mode).companies };
}

export default function CompaniesPage({
	searchParams,
}: PageProps<"/[slug]/companies">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<WorkspaceSectionHeading section="companies" />
				</PageShellHeading>
				<PageShellActions>
					<CreateCompanySheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Companies searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Companies({
	searchParams,
}: Pick<PageProps<"/[slug]/companies">, "searchParams">) {
	await requireSession();

	const values = await companiesSearchParams.load(searchParams);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.companies.list.queryOptions(companiesSearchParams.toInput(values)),
		),
		queryClient.prefetchQuery(trpc.workspace.get.queryOptions()),
	]);
	void queryClient.prefetchQuery(trpc.users.list.queryOptions());

	return (
		<HydrateClient>
			<CompaniesTable />
		</HydrateClient>
	);
}
