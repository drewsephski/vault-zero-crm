"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import type { AcquisitionEngagementStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	ACQUISITION_ENGAGEMENT_STAGE_OPTIONS,
	AcquisitionEngagementStageIndicator,
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

	const updateStage = useMutation(
		trpc.acquisition.updateEngagementStage.mutationOptions({
			onSuccess: async () => {
				await cache.engagement();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
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
					onValueChange={(next) =>
						updateStage.mutate({
							engagementId,
							stage: next as AcquisitionEngagementStage,
						})
					}
				>
					{ACQUISITION_ENGAGEMENT_STAGE_OPTIONS.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
