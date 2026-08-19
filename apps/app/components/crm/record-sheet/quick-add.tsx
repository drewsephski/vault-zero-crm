"use client";

import { Button } from "@crm/ui/components/button";
import { DatePicker } from "@crm/ui/components/date-picker";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DEAL_AMOUNT_CENTS = 99_999_999_999_999;

function clean(value: string): string {
	return value.trim();
}

function parseAmountCents(input: string): { cents: number | null; error: string | null } {
	if (input === "") {
		return { cents: null, error: null };
	}

	const parsed = Number.parseFloat(input);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return {
			cents: null,
			error: "Amount has to be a non-negative number.",
		};
	}

	const cents = Math.round(parsed * 100);
	if (!Number.isSafeInteger(cents) || cents < 0) {
		return {
			cents: null,
			error: "Amount has to be a valid number.",
		};
	}

	if (cents > MAX_DEAL_AMOUNT_CENTS) {
		return {
			cents: null,
			error: "That amount is too large to record.",
		};
	}

	return { cents, error: null };
}

function QuickAddForm({
	submitLabel,
	pending,
	ready,
	onSubmit,
	onCancel,
	children,
}: {
	submitLabel: string;
	pending: boolean;
	ready: boolean;
	onSubmit: () => void;
	onCancel: () => void;
	children: React.ReactNode;
}) {
	return (
		<form
			className="flex shrink-0 flex-col gap-4 border-b px-5 py-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<div className="grid gap-4 sm:grid-cols-2">{children}</div>
			<div className="flex items-center justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={pending}
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={pending || !ready}>
					{pending ? <Spinner /> : null}
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}

export function QuickAddContact({
	companyId,
	ownerId,
	onDone,
}: {
	companyId: string;
	ownerId: string | null;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [title, setTitle] = useState("");
	const [touchedName, setTouchedName] = useState(false);
	const [touchedEmail, setTouchedEmail] = useState(false);

	const firstNameId = useId();
	const lastNameId = useId();
	const emailId = useId();
	const titleId = useId();

	const nextFirstName = clean(firstName);
	const nextEmail = clean(email);
	const emailError =
		touchedEmail && nextEmail !== "" && !EMAIL_PATTERN.test(nextEmail)
			? "Use a valid email address."
			: null;

	const canSubmit = nextFirstName !== "" && emailError === null;

	const create = useMutation(
		trpc.contacts.create.mutationOptions({
			onSuccess: async (contact) => {
				await cache.contact(contact.id);
				toast.success(`${contact.firstName} added.`);
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<QuickAddForm
			submitLabel="Add contact"
			pending={create.isPending}
			ready={canSubmit}
			onCancel={onDone}
			onSubmit={() => {
				if (nextFirstName === "") {
					setTouchedName(true);
					return;
				}

				if (emailError) {
					setTouchedEmail(true);
					return;
				}

				create.mutate({
					firstName: nextFirstName,
					lastName: clean(lastName) || undefined,
					email: nextEmail || undefined,
					title: clean(title) || undefined,
					companyId,
					ownerId,
				});
			}}
		>
			<Field>
				<FieldLabel htmlFor={firstNameId}>First name</FieldLabel>
				<Input
					id={firstNameId}
					autoFocus
					value={firstName}
					disabled={create.isPending}
					autoComplete="off"
					onBlur={() => setTouchedName(true)}
					onChange={(event) => {
						setFirstName(event.target.value);
						if (touchedName) {
							setTouchedName(false);
						}
					}}
				/>
				{touchedName && nextFirstName === "" ? (
					<p className="text-destructive text-xs">First name is required.</p>
				) : null}
			</Field>
			<Field>
				<FieldLabel htmlFor={lastNameId}>Last name</FieldLabel>
				<Input
					id={lastNameId}
					value={lastName}
					disabled={create.isPending}
					autoComplete="off"
					onChange={(event) => setLastName(event.target.value)}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor={emailId}>Email</FieldLabel>
				<Input
					id={emailId}
					type="email"
					value={email}
					disabled={create.isPending}
					autoComplete="off"
					onBlur={() => setTouchedEmail(true)}
					onChange={(event) => {
						setEmail(event.target.value);
						if (touchedEmail) {
							setTouchedEmail(false);
						}
					}}
				/>
				{emailError ? (
					<p className="text-destructive text-xs">{emailError}</p>
				) : null}
			</Field>
			<Field>
				<FieldLabel htmlFor={titleId}>Title</FieldLabel>
				<Input
					id={titleId}
					value={title}
					disabled={create.isPending}
					autoComplete="off"
					onChange={(event) => setTitle(event.target.value)}
					placeholder="Head of Security"
				/>
			</Field>
		</QuickAddForm>
	);
}

export function QuickAddDeal({
	companyId,
	companyName,
	ownerId,
	onDone,
}: {
	companyId: string;
	companyName: string;
	ownerId: string | null;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [name, setName] = useState("");
	const [amount, setAmount] = useState("");
	const [closeDate, setCloseDate] = useState("");
	const [touchedName, setTouchedName] = useState(false);
	const [touchedAmount, setTouchedAmount] = useState(false);

	const nameId = useId();
	const amountId = useId();
	const closeId = useId();

	const me = useQuery(trpc.users.me.queryOptions());
	const owner = ownerId ?? me.data?.id ?? null;

	const nextName = clean(name);
	const nextAmount = clean(amount);
	const nextAmountParse = parseAmountCents(nextAmount);
	const amountError =
		touchedAmount || nextAmount !== ""
			? nextAmountParse.error
			: null;
	const isOwnerResolving = ownerId === null && me.isLoading;
	const canSubmit =
		nextName !== "" &&
			amountError === null &&
			owner !== null &&
			!isOwnerResolving;

	const create = useMutation(
		trpc.deals.create.mutationOptions({
			onSuccess: async (deal) => {
				await cache.deal(deal.id);
				toast.success(`${companyName} deal ${deal.name} created.`);
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<QuickAddForm
			submitLabel="Add deal"
			pending={create.isPending}
			ready={canSubmit}
			onCancel={onDone}
			onSubmit={() => {
				if (nextName === "") {
					setTouchedName(true);
					return;
				}

				if (nextAmountParse.error) {
					setTouchedAmount(true);
					return;
				}

				if (owner === null) {
					toast.error("Could not determine who should own this deal.");
					return;
				}

				create.mutate({
					name: nextName,
					companyId,
					ownerId: owner,
					amountCents: nextAmountParse.cents,
					expectedCloseDate: closeDate || null,
				});
			}}
		>
			<Field>
				<FieldLabel htmlFor={nameId}>Deal name</FieldLabel>
				<Input
					id={nameId}
					autoFocus
					value={name}
					disabled={create.isPending}
					autoComplete="off"
					onBlur={() => setTouchedName(true)}
					onChange={(event) => {
						setName(event.target.value);
						if (touchedName) {
							setTouchedName(false);
						}
					}}
				/>
				{touchedName && nextName === "" ? (
					<p className="text-destructive text-xs">Deal name is required.</p>
				) : null}
			</Field>
			<Field>
				<FieldLabel htmlFor={amountId}>Amount</FieldLabel>
				<Input
					id={amountId}
					value={amount}
					disabled={create.isPending}
					autoComplete="off"
					onBlur={() => setTouchedAmount(true)}
					onChange={(event) => {
						setAmount(event.target.value);
						if (touchedAmount) {
							setTouchedAmount(false);
						}
					}}
					placeholder="25000"
				/>
				{amountError ? (
					<p className="text-destructive text-xs">{amountError}</p>
				) : null}
			</Field>
			<Field>
				<FieldLabel htmlFor={closeId}>Close date</FieldLabel>
					<DatePicker
						id={closeId}
						value={closeDate || null}
						onChange={(next) => setCloseDate(next)}
						placeholder="Optional"
					/>
			</Field>
		</QuickAddForm>
	);
}
