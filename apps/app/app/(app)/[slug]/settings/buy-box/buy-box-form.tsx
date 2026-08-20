"use client";

import { WorkspaceMode } from "@crm/db/enums";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
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
	BUY_BOX_FIELD_IDS,
	BUY_BOX_STEPS,
	type BuyBoxDraft,
	type BuyBoxErrors,
	type BuyBoxField,
	errorsForStep,
	listValues,
	moneyCents,
	percentage,
	profileDraft,
	stepDescription,
	validateBuyBoxDraft,
} from "./buy-box-values";

type BuyBoxFormProps = {
	presentation?: "card" | "inline";
	onSaved?: () => void;
};

export function BuyBoxForm({
	presentation = "card",
	onSaved,
}: BuyBoxFormProps = {}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const profile = useQuery(trpc.workspace.acquisitionProfile.queryOptions());
	const [draft, setDraft] = useState<BuyBoxDraft | null>(null);
	const [errors, setErrors] = useState<BuyBoxErrors>({});
	const [step, setStep] = useState(0);

	const save = useMutation(
		trpc.workspace.updateAcquisitionProfile.mutationOptions({
			onSuccess: async (result) => {
				await cache.workspace();
				setDraft(null);
				setErrors({});
				setStep(0);
				onSaved?.();
				toast.success(
					result.discoveryQueued
						? "Buy box saved. Eve is refreshing the discovery strategy."
						: "Buy box saved. Add an industry or geography to start discovery.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (profile.isError && !profile.data) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Could not load the buy box</AlertTitle>
				<AlertDescription>{profile.error.message}</AlertDescription>
				<AlertAction>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void profile.refetch()}
					>
						Try again
					</Button>
				</AlertAction>
			</Alert>
		);
	}

	if (!profile.data) {
		return (
			<div aria-busy="true" className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const values = draft ?? profileDraft(profile.data);
	const edit = (patch: Partial<BuyBoxDraft>) => {
		setDraft({ ...values, ...patch });
		setErrors((current) => {
			const next = { ...current };
			for (const field of Object.keys(patch) as BuyBoxField[])
				delete next[field];
			return next;
		});
	};
	const canManage = profile.data.canManage && !save.isPending;

	const focusFirstError = (nextErrors: BuyBoxErrors) => {
		const field = Object.keys(nextErrors)[0] as BuyBoxField | undefined;
		if (!field) return;
		requestAnimationFrame(() =>
			document.getElementById(BUY_BOX_FIELD_IDS[field])?.focus(),
		);
	};

	const validateStep = (targetStep: number): boolean => {
		const nextErrors = errorsForStep(validateBuyBoxDraft(values), targetStep);
		if (Object.keys(nextErrors).length === 0) return true;
		setErrors((current) => ({ ...current, ...nextErrors }));
		focusFirstError(nextErrors);
		return false;
	};

	const submit = () => {
		const nextErrors = validateBuyBoxDraft(values);
		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			const firstField = Object.keys(nextErrors)[0] as BuyBoxField;
			const errorStep = BUY_BOX_STEPS.findIndex((_, index) =>
				Object.hasOwn(errorsForStep(nextErrors, index), firstField),
			);
			if (errorStep >= 0) setStep(errorStep);
			focusFirstError(nextErrors);
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
			customerConcentrationMax: percentage(values.customerConcentrationMax),
			assetPreference: values.assetPreference,
			financingAssumptions: values.financingAssumptions.trim() || null,
		});
	};

	const form = (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				if (step < BUY_BOX_STEPS.length - 1) {
					if (validateStep(step)) setStep((current) => current + 1);
					return;
				}
				submit();
			}}
		>
			<CardHeader className={presentation === "inline" ? "px-0" : undefined}>
				<CardTitle>
					{BUY_BOX_STEPS[step]} · {step + 1} of {BUY_BOX_STEPS.length}
				</CardTitle>
				<CardDescription>{stepDescription(step)}</CardDescription>
			</CardHeader>

			<CardContent className={presentation === "inline" ? "px-0" : undefined}>
					<ol aria-label="Buy box progress" className="grid grid-cols-4 gap-2">
						{BUY_BOX_STEPS.map((label, index) => (
							<li
								key={label}
								aria-current={index === step ? "step" : undefined}
								className={
									index === step
										? "border-primary border-t-2 pt-2 text-center font-medium text-xs"
										: "border-t pt-2 text-center text-muted-foreground text-xs"
								}
							>
								<span className="hidden sm:inline">{label}</span>
								<span className="sm:hidden">{index + 1}</span>
							</li>
						))}
					</ol>

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

					{profile.data.canManage ? null : (
						<p className="text-muted-foreground text-xs">
							Only a workspace owner or admin can change the buy box.
						</p>
					)}

					<FieldSet disabled={!canManage}>
						{step === 0 ? (
							<FocusStep values={values} errors={errors} edit={edit} />
						) : null}
						{step === 1 ? (
							<FinancialStep values={values} errors={errors} edit={edit} />
						) : null}
						{step === 2 ? (
							<OperationsStep values={values} errors={errors} edit={edit} />
						) : null}
						{step === 3 ? (
							<FinancingStep values={values} errors={errors} edit={edit} />
						) : null}
					</FieldSet>
			</CardContent>
			<CardFooter className={presentation === "inline" ? "px-0" : undefined}>
				<div className="flex w-full items-center justify-between gap-3">
					<Button
						type="button"
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
							type="button"
							disabled={!canManage}
							onClick={() => {
								if (validateStep(step)) {
									setStep((current) => current + 1);
								}
							}}
						>
							Continue
						</Button>
					) : (
						<Button type="submit" disabled={!canManage}>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							Save buy box
						</Button>
					)}
				</div>
			</CardFooter>
		</form>
	);

	if (presentation === "inline") {
		return form;
	}

	return <Card>{form}</Card>;
}
