"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { buyBoxMutationPayload, emptyBuyBoxDraft } from "./buy-box-values";

export function BuyBoxClearDialog({
	currency,
	children,
	onCleared,
	...props
}: {
	currency: string;
	children: ReactNode;
	onCleared?: () => void;
} & Omit<ComponentProps<typeof Button>, "onClick" | "disabled">) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const clear = useMutation(
		trpc.workspace.updateAcquisitionProfile.mutationOptions({
			onSuccess: async () => {
				await cache.buyBox();
				onCleared?.();
				toast.success("Buy box cleared.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button disabled={clear.isPending} {...props}>
					{children}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Clear the buy box?</AlertDialogTitle>
					<AlertDialogDescription>
						This removes all acquisition criteria. Target fit assessments will
						no longer compare against your criteria until you configure a new
						buy box.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={clear.isPending}
						onClick={(event) => {
							event.preventDefault();
							clear.mutate(buyBoxMutationPayload(emptyBuyBoxDraft(currency)));
						}}
					>
						{clear.isPending ? <Spinner data-icon="inline-start" /> : null}
						Clear buy box
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
