"use client";

import Add from "@carbon/icons-react/es/Add";
import { AcquisitionEngagementStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import {
	Select,
	SelectContent,
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
import { type ComponentProps, Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceLabels } from "@/lib/use-workspace-labels";

const UNSET = "";
const AUTOMATIC_OWNER = "automatic";

function AddButton(props: ComponentProps<typeof Button>) {
	const labels = useWorkspaceLabels();
	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			New {labels.dealLower}
		</Button>
	);
}

export function CreateEngagementSheet({ companyId }: { companyId?: string }) {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateEngagementForm companyId={companyId} />
		</Suspense>
	);
}

function CreateEngagementForm({ companyId }: { companyId?: string }) {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const labels = useWorkspaceLabels();
	const idempotencyKey = useRef(crypto.randomUUID());

	const [open, setOpen] = useQueryState(
		"new",
		parseAsBoolean.withDefault(false),
	);
	const [company, setCompany] = useState(companyId ?? UNSET);
	const [ownerId, setOwnerId] = useState(AUTOMATIC_OWNER);

	const users = useQuery(trpc.users.list.queryOptions());
	const targets = useQuery(
		trpc.acquisition.engagementTargetOptions.queryOptions({ q: "" }),
	);

	const resetAttempt = () => {
		idempotencyKey.current = crypto.randomUUID();
	};

	const create = useMutation(
		trpc.acquisition.createEngagement.mutationOptions({
			onSuccess: async (engagement) => {
				await cache.acquisitionActivity(engagement.companyId);
				toast.success("Opportunity opened.");
				await setOpen(null);
				setCompany(companyId ?? UNSET);
				setOwnerId(AUTOMATIC_OWNER);
				resetAttempt();
				openRecord({ kind: "company", id: engagement.companyId });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const ready = company !== UNSET;

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) resetAttempt();
				void setOpen(next || null);
			}}
		>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>New {labels.dealLower}</SheetTitle>
					<SheetDescription>
						Open an acquisition opportunity on a target you are already
						tracking.
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-engagement"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({
							companyId: company,
							idempotencyKey: idempotencyKey.current,
							ownerId: ownerId === AUTOMATIC_OWNER ? undefined : ownerId,
							stage: AcquisitionEngagementStage.OUTREACH,
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="create-engagement-target">
								{labels.company}
							</FieldLabel>
							<Select
								value={company}
								onValueChange={setCompany}
								disabled={Boolean(companyId)}
							>
								<SelectTrigger id="create-engagement-target">
									<SelectValue
										placeholder={`Choose a ${labels.companyLower}`}
									/>
								</SelectTrigger>
								<SelectContent>
									{(targets.data ?? []).map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								Only targets without an active opportunity appear here.
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-engagement-owner">Owner</FieldLabel>
							<Select value={ownerId} onValueChange={setOwnerId}>
								<SelectTrigger id="create-engagement-owner">
									<SelectValue placeholder="Choose an owner" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={AUTOMATIC_OWNER}>
										Automatic (company owner)
									</SelectItem>
									{(users.data ?? []).map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="create-engagement"
						disabled={create.isPending || !ready}
					>
						{create.isPending ? <Spinner /> : null}
						Open {labels.dealLower}
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
