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
import { BuyBoxForm } from "./buy-box-form";

export const metadata: Metadata = {
	title: "Buy box",
};

export default function BuyBoxSettingsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Buy box</PageShellTitle>
					<PageShellDescription>
						Define what this workspace wants to acquire. The agent and screening
						surfaces can use the same structured criteria.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<BuyBoxSettings />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function BuyBoxSettings() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(
		trpc.workspace.acquisitionProfile.queryOptions(),
	);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<BuyBoxForm />
			</div>
		</HydrateClient>
	);
}
