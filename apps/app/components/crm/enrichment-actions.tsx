"use client";

import MagicWand from "@carbon/icons-react/es/MagicWand";
import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BuyBoxSetupButton } from "@/app/(app)/[slug]/settings/buy-box/buy-box-dialog";
import { acquisitionProfileDossierReady } from "@/lib/acquisition";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { EnrichmentActivity } from "./enrichment-status";

export function EnrichmentActions({
	companyId,
	hasDomain,
	activity,
	acquisition,
	queuedKinds,
}: {
	companyId: string;
	hasDomain: boolean;
	activity: EnrichmentActivity;
	acquisition: boolean;
	queuedKinds: string[];
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const acquisitionProfile = useQuery({
		...trpc.workspace.acquisitionProfile.queryOptions(),
		enabled: acquisition,
	});

	const enrich = useMutation(
		trpc.companies.enrich.mutationOptions({
			onSuccess: async (result) => {
				await cache.company(companyId);
				toast.success(
					result.queued
						? "Looking it up — this page will update when it finishes."
						: "Already running.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const research = useMutation(
		trpc.companies.research.mutationOptions({
			onSuccess: async (result) => {
				await Promise.all([cache.company(companyId), cache.activity()]);
				toast.success(
					result.kind === "acquisition"
						? "Fit analysis queued — the dossier will update when Eve finishes."
						: "Research brief queued — this page will update when Eve finishes.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const detailsBusy = queuedKinds.some((kind) =>
		["brand", "company-details"].includes(kind),
	);
	const researchKind = acquisition ? "acquisition-refresh" : "company-profile";
	const researchBusy = queuedKinds.includes(researchKind);
	const buyBoxReady = acquisitionProfile.data
		? acquisitionProfileDossierReady(acquisitionProfile.data)
		: null;
	const researchBlocked = acquisition && buyBoxReady === false;
	const researchLabel = acquisition ? "Analyze fit" : "Research brief";
	const researchDescription = acquisition
		? "Compare this company with the buy box and write an evidence-backed acquisition dossier."
		: "Read CRM history and current public information to write an account brief.";

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						aria-label="Refresh company details"
						disabled={
							!hasDomain ||
							enrich.isPending ||
							research.isPending ||
							activity !== null
						}
						onClick={() => enrich.mutate({ id: companyId })}
					>
						{enrich.isPending || detailsBusy ? (
							<Spinner />
						) : (
							<Icon icon={Renew} data-icon="inline-start" />
						)}
						<span className="hidden sm:inline">
							{detailsBusy ? "Refreshing" : "Refresh details"}
						</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					Refresh the logo, industry, location, website, and company links.
				</TooltipContent>
			</Tooltip>

			{researchBlocked ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<BuyBoxSetupButton
								size="sm"
								aria-label="Set buy box before analyzing fit"
							>
								<Icon icon={MagicWand} data-icon="inline-start" />
								<span className="hidden sm:inline">Set buy box</span>
							</BuyBoxSetupButton>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						Add at least one buy-box criterion before Eve analyzes acquisition
						fit.
					</TooltipContent>
				</Tooltip>
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="sm"
							aria-label={researchLabel}
							disabled={
								!hasDomain ||
								(acquisition && buyBoxReady === null) ||
								research.isPending ||
								enrich.isPending ||
								activity !== null
							}
							onClick={() => research.mutate({ id: companyId })}
						>
							{research.isPending || researchBusy ? (
								<Spinner />
							) : (
								<Icon icon={MagicWand} data-icon="inline-start" />
							)}
							<span className="hidden sm:inline">
								{researchBusy
									? acquisition
										? "Analyzing"
										: "Working"
									: researchLabel}
							</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>{researchDescription}</TooltipContent>
				</Tooltip>
			)}
		</>
	);
}

export function ContactEnrichmentAction({
	contactId,
	busy = false,
}: {
	contactId: string;
	busy?: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const enrich = useMutation(
		trpc.contacts.enrich.mutationOptions({
			onSuccess: async () => {
				await cache.contact(contactId);
				toast.success(
					"Taking another look — this page will update when it finishes.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={enrich.isPending || busy}
			onClick={() => enrich.mutate({ id: contactId })}
		>
			{enrich.isPending ? (
				<Spinner />
			) : (
				<Icon icon={Renew} data-icon="inline-start" />
			)}
			<span className="hidden sm:inline">
				{busy ? "Researching" : "Re-enrich"}
			</span>
		</Button>
	);
}
