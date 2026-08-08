"use client";

import { CURRENCIES } from "@crm/db/currency";
import {
	AcquisitionAssetPreference,
	AcquisitionOwnerInvolvement,
	AcquisitionRevenuePreference,
} from "@crm/db/enums";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { useId } from "react";
import type { BuyBoxDraft } from "./buy-box-values";

type StepProps = {
	values: BuyBoxDraft;
	edit: (patch: Partial<BuyBoxDraft>) => void;
};

export function FocusStep({ values, edit }: StepProps) {
	const industryId = useId();
	const geographyId = useId();
	const excludedId = useId();

	return (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor={industryId}>Preferred industries</FieldLabel>
				<Input
					id={industryId}
					value={values.preferredIndustries}
					onChange={(event) =>
						edit({ preferredIndustries: event.target.value })
					}
					placeholder="HVAC, commercial services, specialty manufacturing"
				/>
				<FieldDescription>Separate industries with commas.</FieldDescription>
			</Field>
			<Field>
				<FieldLabel htmlFor={geographyId}>Geography</FieldLabel>
				<Input
					id={geographyId}
					value={values.geographies}
					onChange={(event) => edit({ geographies: event.target.value })}
					placeholder="Texas, Midwest, remote"
				/>
				<FieldDescription>
					Use cities, states, regions, or countries and separate them with
					commas.
				</FieldDescription>
			</Field>
			<Field>
				<FieldLabel htmlFor={excludedId}>Excluded categories</FieldLabel>
				<Input
					id={excludedId}
					value={values.excludedCategories}
					onChange={(event) => edit({ excludedCategories: event.target.value })}
					placeholder="Restaurants, pre-revenue, franchises"
				/>
				<FieldDescription>
					Targets matching these categories should be screened out.
				</FieldDescription>
			</Field>
		</FieldGroup>
	);
}

export function FinancialStep({ values, edit }: StepProps) {
	const currencyId = useId();

	return (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor={currencyId}>Currency</FieldLabel>
				<Select
					value={values.currency}
					onValueChange={(currency) => edit({ currency })}
				>
					<SelectTrigger id={currencyId}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CURRENCIES.map((currency) => (
							<SelectItem key={currency.code} value={currency.code}>
								{currency.code} · {currency.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<MoneyRange
				label="Annual revenue"
				minimum={values.revenueMin}
				maximum={values.revenueMax}
				onMinimum={(revenueMin) => edit({ revenueMin })}
				onMaximum={(revenueMax) => edit({ revenueMax })}
			/>
			<MoneyRange
				label="EBITDA or SDE"
				minimum={values.ebitdaMin}
				maximum={values.ebitdaMax}
				onMinimum={(ebitdaMin) => edit({ ebitdaMin })}
				onMaximum={(ebitdaMax) => edit({ ebitdaMax })}
			/>
			<MoneyRange
				label="Purchase price"
				minimum={values.purchasePriceMin}
				maximum={values.purchasePriceMax}
				onMinimum={(purchasePriceMin) => edit({ purchasePriceMin })}
				onMaximum={(purchasePriceMax) => edit({ purchasePriceMax })}
			/>
		</FieldGroup>
	);
}

export function OperationsStep({ values, edit }: StepProps) {
	const ownerId = useId();
	const recurringId = useId();
	const concentrationId = useId();
	const assetId = useId();

	return (
		<FieldGroup>
			<PreferenceSelect
				id={ownerId}
				label="Owner involvement"
				value={values.ownerInvolvement}
				onChange={(ownerInvolvement) => edit({ ownerInvolvement })}
				options={[
					[AcquisitionOwnerInvolvement.PASSIVE, "Manager-run"],
					[AcquisitionOwnerInvolvement.TRANSITIONAL, "Transition period"],
					[AcquisitionOwnerInvolvement.OPERATOR, "Buyer-operated"],
				]}
			/>
			<PreferenceSelect
				id={recurringId}
				label="Recurring revenue"
				value={values.recurringRevenuePreference}
				onChange={(recurringRevenuePreference) =>
					edit({ recurringRevenuePreference })
				}
				options={[
					[AcquisitionRevenuePreference.REQUIRED, "Required"],
					[AcquisitionRevenuePreference.PREFERRED, "Preferred"],
					[AcquisitionRevenuePreference.OPTIONAL, "Not required"],
				]}
			/>
			<Field>
				<FieldLabel htmlFor={concentrationId}>
					Maximum customer concentration
				</FieldLabel>
				<Input
					id={concentrationId}
					type="number"
					min={0}
					max={100}
					value={values.customerConcentrationMax}
					onChange={(event) =>
						edit({ customerConcentrationMax: event.target.value })
					}
					placeholder="20"
				/>
				<FieldDescription>
					Highest acceptable share of revenue from one customer, as a percent.
				</FieldDescription>
			</Field>
			<PreferenceSelect
				id={assetId}
				label="Asset profile"
				value={values.assetPreference}
				onChange={(assetPreference) => edit({ assetPreference })}
				options={[
					[AcquisitionAssetPreference.ASSET_LIGHT, "Asset-light"],
					[AcquisitionAssetPreference.BALANCED, "Balanced"],
					[AcquisitionAssetPreference.ASSET_HEAVY, "Asset-heavy"],
				]}
			/>
		</FieldGroup>
	);
}

export function FinancingStep({ values, edit }: StepProps) {
	const financingId = useId();

	return (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor={financingId}>Financing assumptions</FieldLabel>
				<Textarea
					id={financingId}
					value={values.financingAssumptions}
					onChange={(event) =>
						edit({ financingAssumptions: event.target.value })
					}
					placeholder="SBA 7(a), 10% equity, seller note preferred, working-capital facility available…"
				/>
				<FieldDescription>
					State assumptions the screening process should not silently invent.
				</FieldDescription>
			</Field>
		</FieldGroup>
	);
}

function MoneyRange({
	label,
	minimum,
	maximum,
	onMinimum,
	onMaximum,
}: {
	label: string;
	minimum: string;
	maximum: string;
	onMinimum: (value: string) => void;
	onMaximum: (value: string) => void;
}) {
	const minimumId = useId();
	const maximumId = useId();

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<Field>
				<FieldLabel htmlFor={minimumId}>{label} minimum</FieldLabel>
				<Input
					id={minimumId}
					type="number"
					min={0}
					step={1000}
					value={minimum}
					onChange={(event) => onMinimum(event.target.value)}
					placeholder="No minimum"
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor={maximumId}>{label} maximum</FieldLabel>
				<Input
					id={maximumId}
					type="number"
					min={0}
					step={1000}
					value={maximum}
					onChange={(event) => onMaximum(event.target.value)}
					placeholder="No maximum"
				/>
			</Field>
		</div>
	);
}

function PreferenceSelect<T extends string>({
	id,
	label,
	value,
	onChange,
	options,
}: {
	id: string;
	label: string;
	value: T | null;
	onChange: (value: T | null) => void;
	options: ReadonlyArray<readonly [T, string]>;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Select
				value={value ?? "ANY"}
				onValueChange={(next) => onChange(next === "ANY" ? null : (next as T))}
			>
				<SelectTrigger id={id}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="ANY">No preference</SelectItem>
					{options.map(([option, optionLabel]) => (
						<SelectItem key={option} value={option}>
							{optionLabel}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</Field>
	);
}
