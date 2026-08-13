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
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { BuyBoxMultiSelect } from "./buy-box-multi-select";
import {
	EARNINGS_RANGE_PRESETS,
	EXCLUDED_CATEGORY_OPTIONS,
	GEOGRAPHY_OPTIONS,
	INDUSTRY_OPTIONS,
	type MoneyRangePreset,
	PURCHASE_PRICE_RANGE_PRESETS,
	REVENUE_RANGE_PRESETS,
} from "./buy-box-options";
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
			<BuyBoxMultiSelect
				id={BUY_BOX_FIELD_IDS.preferredIndustries}
				label="Preferred industries"
				value={values.preferredIndustries}
				options={INDUSTRY_OPTIONS}
				placeholder="Select or add industries"
				description="Choose multiple suggestions or type a custom industry and press Enter."
				error={errors.preferredIndustries}
				onChange={(preferredIndustries) => edit({ preferredIndustries })}
			/>
			<BuyBoxMultiSelect
				id={BUY_BOX_FIELD_IDS.geographies}
				label="Geography"
				value={values.geographies}
				options={GEOGRAPHY_OPTIONS}
				placeholder="Select or add places"
				description="Choose multiple suggestions or type a city, state, region, or country and press Enter."
				error={errors.geographies}
				onChange={(geographies) => edit({ geographies })}
			/>
			<BuyBoxMultiSelect
				id={BUY_BOX_FIELD_IDS.excludedCategories}
				label="Excluded categories"
				value={values.excludedCategories}
				options={EXCLUDED_CATEGORY_OPTIONS}
				placeholder="Select or add exclusions"
				description="Choose multiple suggestions or type a custom exclusion and press Enter. Matching targets will be screened out."
				error={errors.excludedCategories}
				onChange={(excludedCategories) => edit({ excludedCategories })}
			/>
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
				currency={values.currency}
				presets={REVENUE_RANGE_PRESETS}
				minimum={values.revenueMin}
				maximum={values.revenueMax}
				minimumId={BUY_BOX_FIELD_IDS.revenueMin}
				maximumId={BUY_BOX_FIELD_IDS.revenueMax}
				minimumError={errors.revenueMin}
				maximumError={errors.revenueMax}
				onMinimum={(revenueMin) => edit({ revenueMin })}
				onMaximum={(revenueMax) => edit({ revenueMax })}
				onRange={(revenueMin, revenueMax) =>
					edit({ revenueMin, revenueMax })
				}
			/>
			<MoneyRange
				label="EBITDA or SDE"
				currency={values.currency}
				presets={EARNINGS_RANGE_PRESETS}
				minimum={values.ebitdaMin}
				maximum={values.ebitdaMax}
				minimumId={BUY_BOX_FIELD_IDS.ebitdaMin}
				maximumId={BUY_BOX_FIELD_IDS.ebitdaMax}
				minimumError={errors.ebitdaMin}
				maximumError={errors.ebitdaMax}
				onMinimum={(ebitdaMin) => edit({ ebitdaMin })}
				onMaximum={(ebitdaMax) => edit({ ebitdaMax })}
				onRange={(ebitdaMin, ebitdaMax) =>
					edit({ ebitdaMin, ebitdaMax })
				}
			/>
			<MoneyRange
				label="Purchase price"
				currency={values.currency}
				presets={PURCHASE_PRICE_RANGE_PRESETS}
				minimum={values.purchasePriceMin}
				maximum={values.purchasePriceMax}
				minimumId={BUY_BOX_FIELD_IDS.purchasePriceMin}
				maximumId={BUY_BOX_FIELD_IDS.purchasePriceMax}
				minimumError={errors.purchasePriceMin}
				maximumError={errors.purchasePriceMax}
				onMinimum={(purchasePriceMin) => edit({ purchasePriceMin })}
				onMaximum={(purchasePriceMax) => edit({ purchasePriceMax })}
				onRange={(purchasePriceMin, purchasePriceMax) =>
					edit({ purchasePriceMin, purchasePriceMax })
				}
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
	currency,
	presets,
	minimum,
	maximum,
	minimumId,
	maximumId,
	minimumError,
	maximumError,
	onMinimum,
	onMaximum,
	onRange,
}: {
	label: string;
	currency: string;
	presets: readonly MoneyRangePreset[];
	minimum: string;
	maximum: string;
	minimumId: string;
	maximumId: string;
	minimumError?: string;
	maximumError?: string;
	onMinimum: (value: string) => void;
	onMaximum: (value: string) => void;
	onRange: (minimum: string, maximum: string) => void;
}) {
	const selectedPresetIndex = presets.findIndex(
		(preset) => preset.minimum === minimum && preset.maximum === maximum,
	);
	const selectedPreset =
		selectedPresetIndex >= 0 ? `PRESET_${selectedPresetIndex}` : "CUSTOM";
	const presetId = `${minimumId}-preset`;

	return (
		<FieldGroup className="grid gap-3 sm:grid-cols-2">
			<Field className="sm:col-span-2">
				<FieldLabel htmlFor={presetId}>{label} range</FieldLabel>
				<Select
					value={selectedPreset}
					onValueChange={(nextValue) => {
						if (nextValue === "CUSTOM") return;
						const preset = presets[Number(nextValue.replace("PRESET_", ""))];
						if (preset) onRange(preset.minimum, preset.maximum);
					}}
				>
					<SelectTrigger id={presetId} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent position="popper" align="start">
						<SelectGroup>
							{presets.map((preset, index) => (
								<SelectItem
									key={`${preset.minimum}-${preset.maximum}`}
									value={`PRESET_${index}`}
								>
									{moneyRangeLabel(preset, currency)}
								</SelectItem>
							))}
							<SelectItem value="CUSTOM" disabled>
								Custom range
							</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
				<FieldDescription>
					Choose a preset or enter exact minimum and maximum amounts below.
				</FieldDescription>
			</Field>
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
		</FieldGroup>
	);
}

function moneyRangeLabel(
	preset: MoneyRangePreset,
	currency: string,
): string {
	if (!preset.minimum && !preset.maximum) return "Any range";
	if (!preset.minimum) return `Up to ${moneyLabel(preset.maximum, currency)}`;
	if (!preset.maximum) return `${moneyLabel(preset.minimum, currency)}+`;
	return `${moneyLabel(preset.minimum, currency)}–${moneyLabel(preset.maximum, currency)}`;
}

function moneyLabel(value: string, currency: string): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency,
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(Number(value));
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
				<SelectGroup>
					<SelectItem value="ANY">No preference</SelectItem>
					{options.map(([option, optionLabel]) => (
						<SelectItem key={option} value={option}>
							{optionLabel}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
			</Select>
		</Field>
	);
}
