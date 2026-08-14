"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, Suspense, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	acquisitionTargetCreateSubmission,
	targetResearchCopy,
} from "@/lib/acquisition";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceLabels } from "@/lib/use-workspace-labels";

const UNASSIGNED = "unassigned";

function AddButton(props: ComponentProps<typeof Button>) {
	const labels = useWorkspaceLabels();
	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			New {labels.companyLower}
		</Button>
	);
}

export function CreateCompanySheet() {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateCompanyForm />
		</Suspense>
	);
}

function CreateCompanyForm() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const labels = useWorkspaceLabels();

	const [open, setOpen] = useQueryState(
		"new",
		parseAsBoolean.withDefault(false),
	);
	const [name, setName] = useState("");
	const [domain, setDomain] = useState("");
	const [ownerId, setOwnerId] = useState(UNASSIGNED);
	const targetCreateKey = useRef(crypto.randomUUID());

	const nameId = useId();
	const domainId = useId();

	const users = useQuery(trpc.users.list.queryOptions());
	const resetForm = () => {
		setName("");
		setDomain("");
		setOwnerId(UNASSIGNED);
		targetCreateKey.current = crypto.randomUUID();
	};

	const createCompany = useMutation(
		trpc.companies.create.mutationOptions({
			onSuccess: async (company) => {
				await cache.company(company.id);
				toast.success(`${company.name} added.`);
				await setOpen(null);
				resetForm();
				openRecord({ kind: "company", id: company.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const createTarget = useMutation(
		trpc.acquisition.createTarget.mutationOptions({
			onSuccess: async (result) => {
				await cache.acquisition(result.companyId);
				const feedback = targetResearchCopy(result.research).feedback;
				if (feedback?.kind === "success") {
					toast.success(feedback.message);
				} else if (feedback) {
					toast.error(feedback.message);
				}
				await setOpen(null);
				resetForm();
				openRecord({ kind: "company", id: result.companyId });
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const pending = createCompany.isPending || createTarget.isPending;

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next && !pending) targetCreateKey.current = crypto.randomUUID();
				void setOpen(next || null);
			}}
		>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>New {labels.companyLower}</SheetTitle>
					<SheetDescription>
						{labels.acquisition
							? "Add a name and domain. Eve will compare the target with the buy box when both are ready."
							: `Give the ${labels.companyLower} a name and domain. The agent fills in the logo, description, industry, address and socials.`}
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-company"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						const input = {
							name,
							domain: domain || undefined,
							ownerId: ownerId === UNASSIGNED ? null : ownerId,
						};
						if (labels.acquisition) {
							createTarget.mutate(
								acquisitionTargetCreateSubmission(
									input,
									targetCreateKey.current,
								),
							);
						} else {
							createCompany.mutate(input);
						}
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={nameId}>Name</FieldLabel>
							<Input
								id={nameId}
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Stripe"
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={domainId}>Domain</FieldLabel>
							<Input
								id={domainId}
								value={domain}
								onChange={(event) => setDomain(event.target.value)}
								placeholder="stripe.com"
								autoComplete="off"
								inputMode="url"
							/>
							<FieldDescription>
								A full URL is fine — it is reduced to the bare host, which has
								to be unique.
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-company-owner">Owner</FieldLabel>
							<Select value={ownerId} onValueChange={setOwnerId}>
								<SelectTrigger id="create-company-owner">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
										{(users.data ?? []).map((user) => (
											<SelectItem key={user.id} value={user.id}>
												{user.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="create-company"
						disabled={pending || name.trim() === ""}
					>
						{pending ? <Spinner /> : null}
						Add {labels.companyLower}
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
