"use client";

import { WorkspaceMode } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { FieldSet } from "@crm/ui/components/field";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import {
	FinancialStep,
	FinancingStep,
	FocusStep,
	OperationsStep,
} from "./buy-box-steps";
import {
	BUY_BOX_STEPS,
	type BuyBoxDraft,
	listValues,
	moneyCents,
	percentage,
	profileDraft,
	stepDescription,
} from "./buy-box-values";

export function BuyBoxForm() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const profile = useQuery(trpc.workspace.acquisitionProfile.queryOptions());
	const [draft, setDraft] = useState<BuyBoxDraft | null>(null);
	const [step, setStep] = useState(0);

	const save = useMutation(
		trpc.workspace.updateAcquisitionProfile.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				setDraft(null);
				setStep(0);
				toast.success("Buy box saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!profile.data) return null;

	const values = draft ?? profileDraft(profile.data);
	const edit = (patch: Partial<BuyBoxDraft>) =>
		setDraft({ ...values, ...patch });
	const canManage = profile.data.canManage && !save.isPending;

	const submit = () => {
		const concentration = percentage(values.customerConcentrationMax);

		if (values.customerConcentrationMax.trim() && concentration === null) {
			toast.error(
				"Customer concentration must be a whole percent from 0 to 100.",
			);
			return;
		}

		const ranges: Array<readonly [string, string]> = [
			[values.revenueMin, values.revenueMax],
			[values.ebitdaMin, values.ebitdaMax],
			[values.purchasePriceMin, values.purchasePriceMax],
		];

		if (
			ranges.some(([minimum, maximum]) => {
				const min = moneyCents(minimum);
				const max = moneyCents(maximum);
				return min !== null && max !== null && min > max;
			})
		) {
			toast.error("Each maximum must be at least its minimum.");
			return;
		}

		save.mutate({
			preferredIndustries: listValues(values.preferredIndustries),
			geographies: listValues(values.geographies),
			excludedCategories: listValues(values.excludedCategories),
			currency: values.currency,
			revenueMinCents: moneyCents(values.revenueMin),
			revenueMaxCents: moneyCents(values.revenueMax),
			ebitdaMinCents: moneyCents(values.ebitdaMin),
			ebitdaMaxCents: moneyCents(values.ebitdaMax),
			purchasePriceMinCents: moneyCents(values.purchasePriceMin),
			purchasePriceMaxCents: moneyCents(values.purchasePriceMax),
			ownerInvolvement: values.ownerInvolvement,
			recurringRevenuePreference: values.recurringRevenuePreference,
			customerConcentrationMax: concentration,
			assetPreference: values.assetPreference,
			financingAssumptions: values.financingAssumptions.trim() || null,
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{BUY_BOX_STEPS[step]} · {step + 1} of {BUY_BOX_STEPS.length}
				</CardTitle>
				<CardDescription>{stepDescription(step)}</CardDescription>
				<CardAction>
					{step === BUY_BOX_STEPS.length - 1 ? (
						<Button disabled={!canManage} onClick={submit}>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							Save buy box
						</Button>
					) : null}
				</CardAction>
			</CardHeader>

			<CardContent>
				{profile.data.mode === WorkspaceMode.SALES ? (
					<p className="text-muted-foreground text-xs">
						This buy box is saved, but acquisition terminology and dashboard
						metrics stay off until you enable Acquisition CRM in{" "}
						<Link href={workspaceUrl("/settings")} className="underline">
							General settings
						</Link>
						.
					</p>
				) : null}

				<FieldSet disabled={!canManage}>
					{step === 0 ? <FocusStep values={values} edit={edit} /> : null}
					{step === 1 ? <FinancialStep values={values} edit={edit} /> : null}
					{step === 2 ? <OperationsStep values={values} edit={edit} /> : null}
					{step === 3 ? <FinancingStep values={values} edit={edit} /> : null}
				</FieldSet>

				<div className="flex items-center justify-between gap-3 border-t pt-4">
					<Button
						variant="outline"
						disabled={step === 0 || save.isPending}
						onClick={() => setStep((current) => Math.max(0, current - 1))}
					>
						Back
					</Button>
					<span className="text-muted-foreground text-xs" aria-live="polite">
						{BUY_BOX_STEPS[step]}
					</span>
					{step < BUY_BOX_STEPS.length - 1 ? (
						<Button
							disabled={save.isPending}
							onClick={() =>
								setStep((current) =>
									Math.min(BUY_BOX_STEPS.length - 1, current + 1),
								)
							}
						>
							Continue
						</Button>
					) : (
						<span />
					)}
				</div>
			</CardContent>
		</Card>
	);
}
