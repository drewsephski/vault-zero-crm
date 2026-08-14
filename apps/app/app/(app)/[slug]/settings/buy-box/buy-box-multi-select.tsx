"use client";

import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
	useComboboxAnchor,
} from "@crm/ui/components/combobox";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@crm/ui/components/field";
import { type KeyboardEvent, useMemo, useState } from "react";
import { appendListValues, listValues } from "./buy-box-values";

type BuyBoxMultiSelectProps = {
	id: string;
	label: string;
	value: string;
	options: readonly string[];
	placeholder: string;
	description: string;
	error?: string;
	onChange: (value: string) => void;
};

export function BuyBoxMultiSelect({
	id,
	label,
	value,
	options,
	placeholder,
	description,
	error,
	onChange,
}: BuyBoxMultiSelectProps) {
	const anchor = useComboboxAnchor();
	const [inputValue, setInputValue] = useState("");
	const selectedValues = useMemo(() => listValues(value), [value]);
	const items = useMemo(
		() => uniqueValues([...options, ...selectedValues]),
		[options, selectedValues],
	);
	const descriptionId = `${id}-description`;
	const errorId = `${id}-error`;
	const describedBy = error ? `${descriptionId} ${errorId}` : descriptionId;

	const addCustomValue = () => {
		if (!inputValue.trim()) return;
		onChange(appendListValues(value, inputValue));
		setInputValue("");
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (
			event.key !== "Enter" ||
			event.nativeEvent.isComposing ||
			event.currentTarget.getAttribute("aria-activedescendant")
		) {
			return;
		}
		event.preventDefault();
		addCustomValue();
	};

	return (
		<Field data-invalid={Boolean(error)}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Combobox
				items={items}
				multiple
				value={selectedValues}
				inputValue={inputValue}
				onInputValueChange={setInputValue}
				onValueChange={(nextValue) => onChange(nextValue.join(", "))}
			>
				<ComboboxChips ref={anchor}>
					<ComboboxValue>
						{selectedValues.map((item) => (
							<ComboboxChip key={item}>{item}</ComboboxChip>
						))}
					</ComboboxValue>
					<ComboboxChipsInput
						id={id}
						placeholder={
							selectedValues.length === 0 ? placeholder : "Add another"
						}
						aria-invalid={Boolean(error)}
						aria-describedby={describedBy}
						onKeyDown={handleKeyDown}
					/>
				</ComboboxChips>
				<ComboboxContent anchor={anchor} align="start">
					<ComboboxEmpty>
						{inputValue.trim()
							? `Press Enter to add “${inputValue.trim()}”.`
							: "No suggestions available."}
					</ComboboxEmpty>
					<ComboboxList>
						{(item) => (
							<ComboboxItem key={item} value={item}>
								{item}
							</ComboboxItem>
						)}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>
			<FieldDescription id={descriptionId}>{description}</FieldDescription>
			<FieldError id={errorId}>{error}</FieldError>
		</Field>
	);
}

function uniqueValues(values: readonly string[]): string[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const normalized = value.toLowerCase();
		if (seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
}
