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
	FieldError,
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
import {
	BUY_BOX_FIELD_IDS,
	type BuyBoxDraft,
	type BuyBoxErrors,
} from "./buy-box-values";

type StepProps = {
	values: BuyBoxDraft;
	errors: BuyBoxErrors;
	edit: (patch: Partial<BuyBoxDraft>) => void;
};

export function FocusStep({ values, errors, edit }: StepProps) {
	return (
		<FieldGroup>
			<Field data-invalid={Boolean(errors.preferredIndustries)}>
				<FieldLabel htmlFor={BUY_BOX_FIELD_IDS.preferredIndustries}>
					Preferred industries
				</FieldLabel>
				<Input
					id={BUY_BOX_FIELD_IDS.preferredIndustries}
					aria-invalid={Boolean(errors.preferredIndustries)}
					aria-describedby={
						errors.preferredIndustries
							? `${BUY_BOX_FIELD_IDS.preferredIndustries}-error`
							: undefined
					}
					value={values.preferredIndustries}
					onChange={(event) =>
						edit({ preferredIndustries: event.target.value })
					}
					placeholder="HVAC, commercial services, specialty manufacturing"
				/>
				<FieldDescription>Separate industries with commas.</FieldDescription>
				<FieldError id={`${BUY_BOX_FIELD_IDS.preferredIndustries}-error`}>
					{errors.preferredIndustries}
				</FieldError>
			</Field>
			<Field data-invalid={Boolean(errors.geographies)}>
				<FieldLabel htmlFor={BUY_BOX_FIELD_IDS.geographies}>
					Geography
				</FieldLabel>
				<Input
					id={BUY_BOX_FIELD_IDS.geographies}
					aria-invalid={Boolean(errors.geographies)}
					aria-describedby={
						errors.geographies
							? `${BUY_BOX_FIELD_IDS.geographies}-error`
							: undefined
					}
					value={values.geographies}
					onChange={(event) => edit({ geographies: event.target.value })}
					placeholder="Texas, Midwest, remote"
				/>
				<FieldDescription>
					Use cities, states, regions, or countries and separate them with
					commas.
				</FieldDescription>
				<FieldError id={`${BUY_BOX_FIELD_IDS.geographies}-error`}>
					{errors.geographies}
				</FieldError>
			</Field>
			<Field data-invalid={Boolean(errors.excludedCategories)}>
				<FieldLabel htmlFor={BUY_BOX_FIELD_IDS.excludedCategories}>
					Excluded categories
				</FieldLabel>
				<Input
					id={BUY_BOX_FIELD_IDS.excludedCategories}
					aria-invalid={Boolean(errors.excludedCategories)}
					aria-describedby={
						errors.excludedCategories
							? `${BUY_BOX_FIELD_IDS.excludedCategories}-error`
							: undefined
					}
					value={values.excludedCategories}
					onChange={(event) => edit({ excludedCategories: event.target.value })}
					placeholder="Restaurants, pre-revenue, franchises"
				/>
				<FieldDescription>
					Targets matching these categories should be screened out.
				</FieldDescription>
				<FieldError id={`${BUY_BOX_FIELD_IDS.excludedCategories}-error`}>
					{errors.excludedCategories}
				</FieldError>
			</Field>
		</FieldGroup>
	);
}

export function FinancialStep({ values, errors, edit }: StepProps) {
	return (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor={BUY_BOX_FIELD_IDS.currency}>Currency</FieldLabel>
				<Select
					value={values.currency}
					onValueChange={(currency) => edit({ currency })}
				>
					<SelectTrigger id={BUY_BOX_FIELD_IDS.currency}>
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
				minimumId={BUY_BOX_FIELD_IDS.revenueMin}
				maximumId={BUY_BOX_FIELD_IDS.revenueMax}
				minimumError={errors.revenueMin}
				maximumError={errors.revenueMax}
				onMinimum={(revenueMin) => edit({ revenueMin })}
				onMaximum={(revenueMax) => edit({ revenueMax })}
			/>
			<MoneyRange
				label="EBITDA or SDE"
				minimum={values.ebitdaMin}
				maximum={values.ebitdaMax}
				minimumId={BUY_BOX_FIELD_IDS.ebitdaMin}
				maximumId={BUY_BOX_FIELD_IDS.ebitdaMax}
				minimumError={errors.ebitdaMin}
				maximumError={errors.ebitdaMax}
				onMinimum={(ebitdaMin) => edit({ ebitdaMin })}
				onMaximum={(ebitdaMax) => edit({ ebitdaMax })}
			/>
			<MoneyRange
				label="Purchase price"
				minimum={values.purchasePriceMin}
				maximum={values.purchasePriceMax}
				minimumId={BUY_BOX_FIELD_IDS.purchasePriceMin}
				maximumId={BUY_BOX_FIELD_IDS.purchasePriceMax}
				minimumError={errors.purchasePriceMin}
				maximumError={errors.purchasePriceMax}
				onMinimum={(purchasePriceMin) => edit({ purchasePriceMin })}
				onMaximum={(purchasePriceMax) => edit({ purchasePriceMax })}
			/>
		</FieldGroup>
	);
}

export function OperationsStep({ values, errors, edit }: StepProps) {
	return (
		<FieldGroup>
			<PreferenceSelect
				id={BUY_BOX_FIELD_IDS.ownerInvolvement}
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
				id={BUY_BOX_FIELD_IDS.recurringRevenuePreference}
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
			<Field data-invalid={Boolean(errors.customerConcentrationMax)}>
				<FieldLabel htmlFor={BUY_BOX_FIELD_IDS.customerConcentrationMax}>
					Maximum customer concentration
				</FieldLabel>
				<Input
					id={BUY_BOX_FIELD_IDS.customerConcentrationMax}
					aria-invalid={Boolean(errors.customerConcentrationMax)}
					aria-describedby={
						errors.customerConcentrationMax
							? `${BUY_BOX_FIELD_IDS.customerConcentrationMax}-error`
							: undefined
					}
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
				<FieldError id={`${BUY_BOX_FIELD_IDS.customerConcentrationMax}-error`}>
					{errors.customerConcentrationMax}
				</FieldError>
			</Field>
			<PreferenceSelect
				id={BUY_BOX_FIELD_IDS.assetPreference}
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

export function FinancingStep({ values, errors, edit }: StepProps) {
	return (
		<FieldGroup>
			<Field data-invalid={Boolean(errors.financingAssumptions)}>
				<FieldLabel htmlFor={BUY_BOX_FIELD_IDS.financingAssumptions}>
					Financing assumptions
				</FieldLabel>
				<Textarea
					id={BUY_BOX_FIELD_IDS.financingAssumptions}
					aria-invalid={Boolean(errors.financingAssumptions)}
					aria-describedby={
						errors.financingAssumptions
							? `${BUY_BOX_FIELD_IDS.financingAssumptions}-error`
							: undefined
					}
					maxLength={500}
					value={values.financingAssumptions}
					onChange={(event) =>
						edit({ financingAssumptions: event.target.value })
					}
					placeholder="SBA 7(a), 10% equity, seller note preferred, working-capital facility available…"
				/>
				<FieldDescription>
					State assumptions the screening process should not silently invent.
				</FieldDescription>
				<FieldError id={`${BUY_BOX_FIELD_IDS.financingAssumptions}-error`}>
					{errors.financingAssumptions}
				</FieldError>
			</Field>
		</FieldGroup>
	);
}

function MoneyRange({
	label,
	minimum,
	maximum,
	minimumId,
	maximumId,
	minimumError,
	maximumError,
	onMinimum,
	onMaximum,
}: {
	label: string;
	minimum: string;
	maximum: string;
	minimumId: string;
	maximumId: string;
	minimumError?: string;
	maximumError?: string;
	onMinimum: (value: string) => void;
	onMaximum: (value: string) => void;
}) {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<Field data-invalid={Boolean(minimumError)}>
				<FieldLabel htmlFor={minimumId}>{label} minimum</FieldLabel>
				<Input
					id={minimumId}
					aria-invalid={Boolean(minimumError)}
					aria-describedby={minimumError ? `${minimumId}-error` : undefined}
					inputMode="decimal"
					value={minimum}
					onChange={(event) => onMinimum(event.target.value)}
					placeholder="No minimum"
				/>
				<FieldError id={`${minimumId}-error`}>{minimumError}</FieldError>
			</Field>
			<Field data-invalid={Boolean(maximumError)}>
				<FieldLabel htmlFor={maximumId}>{label} maximum</FieldLabel>
				<Input
					id={maximumId}
					aria-invalid={Boolean(maximumError)}
					aria-describedby={maximumError ? `${maximumId}-error` : undefined}
					inputMode="decimal"
					value={maximum}
					onChange={(event) => onMaximum(event.target.value)}
					placeholder="No maximum"
				/>
				<FieldError id={`${maximumId}-error`}>{maximumError}</FieldError>
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
