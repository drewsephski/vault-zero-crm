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
import { outreachSearchParams } from "./outreach-search-params";
import { OutreachTable } from "./outreach-table";

export const metadata: Metadata = {
	title: "Outreach",
};

export default function OutreachPage({
	searchParams,
}: PageProps<"/[slug]/outreach">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Outreach</PageShellTitle>
					<PageShellDescription>
						Every Vault Zero prospect, with Gmail history and the next honest
						step.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Outreach searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Outreach({
	searchParams,
}: Pick<PageProps<"/[slug]/outreach">, "searchParams">) {
	await requireSession();
	const values = await outreachSearchParams.load(searchParams);
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(
		trpc.outreach.list.queryOptions(outreachSearchParams.toInput(values)),
	);
	void queryClient.prefetchQuery(trpc.users.list.queryOptions());

	return (
		<HydrateClient>
			<OutreachTable />
		</HydrateClient>
	);
}
