"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { AcquisitionEngagementStage } from "@crm/db/enums";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	ACQUISITION_ENGAGEMENT_STAGE_OPTIONS,
	AcquisitionEngagementStageIndicator,
	acquisitionEngagementStageLabel,
	isTerminalEngagementStage,
} from "./acquisition-engagement-stage";

export function AcquisitionEngagementStageMenu({
	engagementId,
	stage,
	variant = "inline",
}: {
	engagementId: string;
	stage: AcquisitionEngagementStage;
	variant?: "inline" | "control";
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [pendingStage, setPendingStage] =
		useState<AcquisitionEngagementStage | null>(null);
	const [closedReason, setClosedReason] = useState("");

	const updateStage = useMutation(
		trpc.acquisition.updateEngagementStage.mutationOptions({
			onSuccess: async () => {
				setPendingStage(null);
				setClosedReason("");
				await cache.engagement();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					{variant === "control" ? (
						<Button
							variant="outline"
							size="sm"
							disabled={updateStage.isPending}
							onClick={(event) => event.stopPropagation()}
						>
							<AcquisitionEngagementStageIndicator
								stage={stage}
								className="text-foreground"
							/>
							<Icon icon={ChevronDown} className="text-muted-foreground" />
						</Button>
					) : (
						<button
							type="button"
							className="inline-flex max-w-full items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
							disabled={updateStage.isPending}
							onClick={(event) => event.stopPropagation()}
						>
							<AcquisitionEngagementStageIndicator stage={stage} />
							<Icon icon={ChevronDown} className="ml-1 text-muted-foreground" />
						</button>
					)}
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					onClick={(event) => event.stopPropagation()}
				>
					<DropdownMenuRadioGroup
						value={stage}
						onValueChange={(next) => {
							const nextStage = next as AcquisitionEngagementStage;
							if (isTerminalEngagementStage(nextStage)) {
								setPendingStage(nextStage);
								return;
							}
							updateStage.mutate({ engagementId, stage: nextStage });
						}}
					>
						{ACQUISITION_ENGAGEMENT_STAGE_OPTIONS.map((option) => (
							<DropdownMenuRadioItem key={option.value} value={option.value}>
								{option.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={pendingStage !== null}
				onOpenChange={(open) => {
					if (!open && !updateStage.isPending) {
						setPendingStage(null);
						setClosedReason("");
					}
				}}
			>
				<AlertDialogContent onClick={(event) => event.stopPropagation()}>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{pendingStage === AcquisitionEngagementStage.PASSED
								? "Pass on this opportunity?"
								: "Mark this opportunity acquired?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							This closes the current pursuit permanently. You can open a new
							opportunity later, but this engagement cannot be reopened.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{pendingStage === AcquisitionEngagementStage.PASSED ? (
						<Textarea
							aria-label="Reason for passing"
							placeholder="Why are you passing on this opportunity?"
							value={closedReason}
							onChange={(event) => setClosedReason(event.target.value)}
							maxLength={500}
						/>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={updateStage.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							variant={
								pendingStage === AcquisitionEngagementStage.PASSED
									? "destructive"
									: "default"
							}
							disabled={
								updateStage.isPending ||
								(pendingStage === AcquisitionEngagementStage.PASSED &&
									!closedReason.trim())
							}
							onClick={(event) => {
								event.preventDefault();
								if (!pendingStage) return;
								updateStage.mutate({
									engagementId,
									stage: pendingStage,
									closedReason:
										pendingStage === AcquisitionEngagementStage.PASSED
											? closedReason.trim()
											: undefined,
								});
							}}
						>
							{pendingStage
								? `Confirm ${acquisitionEngagementStageLabel(pendingStage)}`
								: "Confirm"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
