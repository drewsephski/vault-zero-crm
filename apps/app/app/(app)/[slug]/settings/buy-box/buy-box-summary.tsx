"use client";

import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Spinner } from "@crm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { BuyBoxClearDialog } from "./buy-box-clear-dialog";
import { BuyBoxSetupButton } from "./buy-box-dialog";
import { buyBoxIsConfigured, buyBoxSummaryLines } from "./buy-box-values";

type BuyBoxSummaryProps = {
	presentation?: "card" | "inline";
	showEdit?: boolean;
};

export function BuyBoxSummary({
	presentation = "card",
	showEdit = true,
}: BuyBoxSummaryProps) {
	const trpc = useTRPC();
	const profile = useQuery(trpc.workspace.acquisitionProfile.queryOptions());

	if (profile.isError) return null;

	if (!profile.data) {
		return (
			<div aria-busy="true" className="flex justify-center py-8">
				<Spinner />
			</div>
		);
	}

	if (!buyBoxIsConfigured(profile.data)) return null;

	const lines = buyBoxSummaryLines(profile.data);
	const canManage = profile.data.canManage;

	const content = (
		<>
			<CardHeader className={presentation === "inline" ? "px-0" : undefined}>
				<CardTitle>Buy box</CardTitle>
				<CardDescription>
					{lines.length} configured{" "}
					{lines.length === 1 ? "criterion" : "criteria"} screening targets
				</CardDescription>
				{canManage ? (
					<CardAction>
						<span className="flex items-center gap-2">
							<BuyBoxClearDialog
								currency={profile.data.currency}
								variant="outline"
								size="sm"
							>
								Clear
							</BuyBoxClearDialog>
							{showEdit ? (
								<BuyBoxSetupButton size="sm">Edit</BuyBoxSetupButton>
							) : null}
						</span>
					</CardAction>
				) : null}
			</CardHeader>
			<CardContent className={presentation === "inline" ? "px-0" : undefined}>
				<dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
					{lines.map((line) => (
						<div key={line.label} className="min-w-0">
							<dt className="text-muted-foreground text-xs">{line.label}</dt>
							<dd className="truncate font-medium text-sm">{line.value}</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</>
	);

	if (presentation === "inline") return content;

	return <Card>{content}</Card>;
}

export function BuyBoxSummaryAction() {
	const trpc = useTRPC();
	const profile = useQuery(trpc.workspace.acquisitionProfile.queryOptions());

	if (!profile.data?.canManage) return null;

	if (buyBoxIsConfigured(profile.data)) {
		return <BuyBoxSetupButton size="sm">Edit buy box</BuyBoxSetupButton>;
	}

	return <BuyBoxSetupButton size="sm" />;
}
