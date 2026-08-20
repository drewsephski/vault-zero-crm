"use client";

import Add from "@carbon/icons-react/es/Add";
import Partnership from "@carbon/icons-react/es/Partnership";
import { CURRENCIES, normalizeCurrency } from "@crm/db/currency";
import { AcquisitionEngagementStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import {
	AcquisitionEngagementStageIndicator,
	showsAcquisitionEngagementStageMenu,
} from "@/components/crm/acquisition-engagement-stage";
import { AcquisitionEngagementStageMenu } from "@/components/crm/acquisition-engagement-stage-menu";
import {
	InlineDateField,
	InlineField,
	InlineSelectField,
	savingField,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import {
	DetailSheetEmpty,
	DetailSheetProperties,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceLabels } from "@/lib/use-workspace-labels";

type Company = RouterOutputs["companies"]["byId"];
type EngagementRow =
	RouterOutputs["acquisition"]["listEngagements"]["rows"][number];

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const COLUMNS = [
	{ header: "Stage", width: "w-[24%]", className: "pl-5" },
	{ header: "Amount", width: "w-[18%]", align: "right" as const },
	{ header: "Expected close", width: "w-[22%]" },
	{ header: "Owner", width: "w-[20%]" },
];

const UNASSIGNED_OWNER = "unassigned";
const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({
	value: currency.code,
	label: `${currency.code} · ${currency.name}`,
}));

function EngagementRowCells({ engagement }: { engagement: EngagementRow }) {
	return (
		<>
			<TableCell className="px-3 py-2.5 pl-5">
				{showsAcquisitionEngagementStageMenu(engagement.status) ? (
					<AcquisitionEngagementStageMenu
						engagementId={engagement.id}
						stage={engagement.stage}
					/>
				) : (
					<AcquisitionEngagementStageIndicator stage={engagement.stage} />
				)}
			</TableCell>
			<TableCell className="px-3 py-2.5 text-right">
				{engagement.amountCents === null ? (
					<EmptyCellValue />
				) : (
					<span className="tabular-nums">
						{formatMoney(engagement.amountCents, engagement.currency)}
					</span>
				)}
			</TableCell>
			<TableCell className="px-3 py-2.5 text-muted-foreground">
				{engagement.expectedCloseDate ? (
					dateFormat.format(new Date(engagement.expectedCloseDate))
				) : (
					<EmptyCellValue />
				)}
			</TableCell>
			<TableCell className="px-3 py-2.5">
				<OwnerCell owner={engagement.owner} />
			</TableCell>
		</>
	);
}

export function CompanyOpportunities({ company }: { company: Company }) {
	const trpc = useTRPC();
	const labels = useWorkspaceLabels();
	const cache = useCrmCache();
	const idempotencyKey = useRef(crypto.randomUUID());

	const engagements = useQuery(
		trpc.acquisition.listEngagements.queryOptions({
			companyId: company.id,
			status: "all",
			q: "",
			sort: "stageChangedAt",
			dir: "desc",
			page: 1,
			pageSize: 100,
			owner: "all",
			stage: "all",
		}),
	);
	const users = useQuery(trpc.users.list.queryOptions());

	const { active, history } = useMemo(() => {
		const rows = engagements.data?.rows ?? [];
		return {
			active: rows.filter((row) => row.status === "ACTIVE"),
			history: rows.filter((row) => row.status === "TERMINAL"),
		};
	}, [engagements.data?.rows]);

	const create = useMutation(
		trpc.acquisition.createEngagement.mutationOptions({
			onSuccess: async () => {
				await cache.engagement(company.id);
				toast.success("Opportunity opened.");
				idempotencyKey.current = crypto.randomUUID();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.acquisition.updateEngagement.mutationOptions({
			onSuccess: async () => {
				await cache.engagement(company.id);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!company.acquisitionTarget) {
		return null;
	}

	if (engagements.isPending) {
		return null;
	}

	if (active.length === 0 && history.length === 0) {
		return (
			<DetailSheetEmpty
				icon={Partnership}
				title={`No ${labels.dealsLower} yet`}
				description={`Start the acquisition process when ${company.name} is ready to move beyond research.`}
				action={
					<Button
						variant="outline"
						size="sm"
						disabled={create.isPending}
						onClick={() =>
							create.mutate({
								companyId: company.id,
								idempotencyKey: idempotencyKey.current,
								stage: AcquisitionEngagementStage.OUTREACH,
							})
						}
					>
						Start acquisition process
					</Button>
				}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{active.length > 0 ? (
				<DetailSheetSection title="Active opportunity">
					{active.map((engagement) => {
						const save = (data: {
							ownerId?: string | null;
							amountCents?: number | null;
							currency?: string;
							expectedCloseDate?: string | null;
						}) => update.mutate({ engagementId: engagement.id, ...data });
						const isSaving = savingField({
							isPending: update.isPending,
							variables: update.variables
								? { data: update.variables }
								: undefined,
						});
						const currency = normalizeCurrency(engagement.currency);
						return (
							<div key={engagement.id} className="flex flex-col gap-3">
								<AcquisitionEngagementStageMenu
									engagementId={engagement.id}
									stage={engagement.stage}
									variant="control"
								/>
								<DetailSheetProperties>
									<InlineField
										label="Amount"
										value={
											engagement.amountCents === null
												? null
												: String(engagement.amountCents / 100)
										}
										placeholder="Add amount"
										saving={isSaving("amountCents")}
										onSave={(value) => {
											if (!value) return save({ amountCents: null });
											const amount = Number.parseFloat(value);
											if (!Number.isFinite(amount) || amount < 0) {
												toast.error("Amount has to be a positive number.");
												return;
											}
											save({ amountCents: Math.round(amount * 100) });
										}}
										render={(value) =>
											formatMoney(Math.round(Number(value) * 100), currency)
										}
									/>
									<InlineSelectField
										label="Currency"
										value={currency}
										options={CURRENCY_OPTIONS}
										onSave={(next) => save({ currency: next })}
									/>
									<InlineDateField
										label="Expected close"
										value={engagement.expectedCloseDate}
										saving={isSaving("expectedCloseDate")}
										onSave={(next) =>
											save({
												expectedCloseDate: next
													? new Date(`${next}T12:00:00.000Z`).toISOString()
													: null,
											})
										}
									/>
									<InlineSelectField
										label="Owner"
										value={engagement.ownerId ?? UNASSIGNED_OWNER}
										options={[
											{ value: UNASSIGNED_OWNER, label: "Unassigned" },
											...(users.data ?? []).map((user) => ({
												value: user.id,
												label: user.name,
											})),
										]}
										onSave={(next) =>
											save({
												ownerId: next === UNASSIGNED_OWNER ? null : next,
											})
										}
									/>
								</DetailSheetProperties>
							</div>
						);
					})}
				</DetailSheetSection>
			) : (
				<DetailSheetSection title="Active opportunity">
					<Button
						variant="outline"
						size="sm"
						disabled={create.isPending}
						onClick={() =>
							create.mutate({
								companyId: company.id,
								idempotencyKey: idempotencyKey.current,
								stage: AcquisitionEngagementStage.OUTREACH,
							})
						}
					>
						<Icon icon={Add} data-icon="inline-start" />
						Start acquisition process
					</Button>
				</DetailSheetSection>
			)}

			{history.length > 0 ? (
				<DetailSheetSection title="History">
					<SimpleTable variant="panel" columns={COLUMNS}>
						{history.map((engagement) => (
							<SimpleTableRow key={engagement.id}>
								<EngagementRowCells engagement={engagement} />
							</SimpleTableRow>
						))}
					</SimpleTable>
				</DetailSheetSection>
			) : null}
		</div>
	);
}
