"use client";

import Edit from "@carbon/icons-react/es/Edit";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

type UserOption = { id: string; name: string };
type CompanyOption = { id: string; name: string };

type Props = {
	kind: "contact" | "company";
	ids: string[];
	users: UserOption[];
	companies?: CompanyOption[];
	onClear: () => void;
};

const UNCHANGED = "__unchanged";
const NONE = "__none";

export function BulkRecordActions({
	kind,
	ids,
	users,
	companies = [],
	onClear,
}: Props) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [ownerId, setOwnerId] = useState(UNCHANGED);
	const [companyId, setCompanyId] = useState(UNCHANGED);

	const finish = () => {
		setEditing(false);
		setDeleting(false);
		setOwnerId(UNCHANGED);
		setCompanyId(UNCHANGED);
		onClear();
	};

	const deleteContacts = useMutation(
		trpc.contacts.bulkDelete.mutationOptions({
			onSuccess: async (result) => {
				await cache.removedMany(
					result.ids.map((id) => ({ kind: "contact" as const, id })),
				);
				toast.success(
					`${result.count} contact${result.count === 1 ? "" : "s"} deleted.`,
				);
				finish();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const deleteCompanies = useMutation(
		trpc.companies.bulkDelete.mutationOptions({
			onSuccess: async (result) => {
				await cache.removedMany(
					result.ids.map((id) => ({ kind: "company" as const, id })),
				);
				toast.success(
					`${result.count} compan${result.count === 1 ? "y" : "ies"} deleted.`,
				);
				finish();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const updateContacts = useMutation(
		trpc.contacts.bulkUpdate.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				toast.success(
					`${result.count} contact${result.count === 1 ? "" : "s"} updated.`,
				);
				finish();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const updateCompanies = useMutation(
		trpc.companies.bulkUpdate.mutationOptions({
			onSuccess: async (result) => {
				await cache.company();
				toast.success(
					`${result.count} compan${result.count === 1 ? "y" : "ies"} updated.`,
				);
				finish();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (ids.length === 0) return null;

	const isPending =
		deleteContacts.isPending ||
		deleteCompanies.isPending ||
		updateContacts.isPending ||
		updateCompanies.isPending;
	const overLimit = ids.length > 100;
	const canUpdate =
		ownerId !== UNCHANGED || (kind === "contact" && companyId !== UNCHANGED);

	const submitUpdate = () => {
		if (!canUpdate) return;

		if (kind === "contact") {
			const data: { ownerId?: string | null; companyId?: string | null } = {};
			if (ownerId !== UNCHANGED)
				data.ownerId = ownerId === NONE ? null : ownerId;
			if (companyId !== UNCHANGED)
				data.companyId = companyId === NONE ? null : companyId;
			updateContacts.mutate({ ids, data });
			return;
		}

		updateCompanies.mutate({
			ids,
			data: { ownerId: ownerId === NONE ? null : ownerId },
		});
	};

	return (
		<>
			<div className="flex items-center gap-2">
				<span className="text-xs text-muted-foreground tabular-nums">
					{ids.length} selected
				</span>
				{overLimit ? (
					<span className="text-xs text-destructive">Select up to 100</span>
				) : null}
				<Button
					variant="outline"
					size="sm"
					disabled={isPending || overLimit}
					onClick={() => setEditing(true)}
				>
					<Icon icon={Edit} data-icon="inline-start" />
					Edit
				</Button>
				<Button
					variant="destructive"
					size="sm"
					disabled={isPending || overLimit}
					onClick={() => setDeleting(true)}
				>
					<Icon icon={TrashCan} data-icon="inline-start" />
					Delete
				</Button>
			</div>

			<Dialog
				open={editing}
				onOpenChange={(open) => {
					setEditing(open);
					if (!open) {
						setOwnerId(UNCHANGED);
						setCompanyId(UNCHANGED);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit {ids.length} selected records</DialogTitle>
						<DialogDescription>
							Choose the fields to apply to every selected {kind}.
						</DialogDescription>
					</DialogHeader>

					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="bulk-owner">Owner</FieldLabel>
							<Select value={ownerId} onValueChange={setOwnerId}>
								<SelectTrigger id="bulk-owner">
									<SelectValue placeholder="Leave unchanged" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNCHANGED}>Leave unchanged</SelectItem>
									<SelectItem value={NONE}>Unassigned</SelectItem>
									{users.map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						{kind === "contact" && (
							<Field>
								<FieldLabel htmlFor="bulk-company">Company</FieldLabel>
								<Select value={companyId} onValueChange={setCompanyId}>
									<SelectTrigger id="bulk-company">
										<SelectValue placeholder="Leave unchanged" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={UNCHANGED}>Leave unchanged</SelectItem>
										<SelectItem value={NONE}>No company</SelectItem>
										{companies.map((company) => (
											<SelectItem key={company.id} value={company.id}>
												{company.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</FieldGroup>

					<DialogFooter>
						<Button variant="outline" onClick={() => setEditing(false)}>
							Cancel
						</Button>
						<Button disabled={!canUpdate || isPending} onClick={submitUpdate}>
							{isPending ? <Spinner /> : null}
							Apply changes
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={deleting} onOpenChange={setDeleting}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {ids.length} selected {kind}
							{ids.length === 1 ? "" : "s"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This cannot be undone. Related activity and agent data will be
							removed too.{" "}
							{kind === "company"
								? "Contacts will stay without a company."
								: "Deleted contacts will not return through sync."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={isPending}
							onClick={() =>
								kind === "contact"
									? deleteContacts.mutate({ ids })
									: deleteCompanies.mutate({ ids })
							}
						>
							{isPending ? <Spinner /> : null}
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
