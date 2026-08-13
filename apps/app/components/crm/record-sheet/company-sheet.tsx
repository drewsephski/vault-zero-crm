"use client";

import Add from "@carbon/icons-react/es/Add";
import Partnership from "@carbon/icons-react/es/Partnership";
import Star from "@carbon/icons-react/es/Star";
import StarFilled from "@carbon/icons-react/es/StarFilled";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { AcquisitionFit, AcquisitionStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import { Link } from "@crm/ui/components/link";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { formatMoney, relativeTimeFromIso } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	ACQUISITION_STAGES,
	AcquisitionFitIndicator,
	AcquisitionStageIndicator,
	acquisitionStageLabel,
} from "@/components/crm/acquisition-status";
import { AgentPanel } from "@/components/crm/agent-panel";
import { OPEN_STAGES } from "@/components/crm/deal-stage";
import { EnrichmentActions } from "@/components/crm/enrichment-actions";
import {
	ENRICHMENT_POLL_MS,
	EnrichmentIndicator,
	enrichmentActivity,
	isEnriching,
} from "@/components/crm/enrichment-status";
import {
	InlineField,
	InlineSelectField,
	savingField,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import { CompanySocials, hasCompanyLinks } from "@/components/crm/social-links";
import { DealStageMenu } from "@/components/crm/stage-change";
import { Timeline } from "@/components/crm/timeline/timeline";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetMain,
	DetailSheetPending,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetProse,
	DetailSheetRail,
	DetailSheetResearchStatus,
	DetailSheetSection,
	DetailSheetSplit,
	DetailSheetStat,
	DetailSheetStats,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceLabels } from "@/lib/use-workspace-labels";
import { QuickAddContact, QuickAddDeal } from "./quick-add";
import { RecordActions } from "./record-actions";
import {
	DealAmount,
	DomainLink,
	MetaLine,
	RecordSheetFrame,
} from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Company = RouterOutputs["companies"]["byId"];
type CompanyDeal = Company["deals"][number];

const UNASSIGNED = "unassigned";

function pendingFields(company: Company): string[] {
	const missing: string[] = [];
	if (!company.industry) missing.push("industry");
	if (!company.description) missing.push("description");
	if (!hasCompanyLinks(company)) missing.push("social links");
	return missing;
}

function companyConsequence(company: Company): string {
	const deals = company.deals.length;
	const contacts = company.contacts.length;

	const gone =
		deals > 0
			? `${deals === 1 ? "Its one deal" : `All ${deals} of its deals`} and everything filed against the account go too.`
			: "Everything filed against the account goes too.";

	const kept =
		contacts > 0
			? ` ${contacts === 1 ? "The one person" : `The ${contacts} people`} who work there stay in the CRM, without a company.`
			: "";

	return gone + kept;
}

const CONTACT_COLUMNS = [
	{ srLabel: "Primary", width: "w-10", className: "pl-5" },
	{ header: "Name", width: "w-[28%]" },
	{ header: "Title", width: "w-[24%]" },
	{ header: "Email", width: "w-[26%]" },
	{ header: "Owner", width: "w-[22%]" },
];

const DEAL_COLUMNS = [
	{ header: "Deal", width: "w-[32%]", className: "pl-5" },
	{ header: "Stage", width: "w-[24%]" },
	{ header: "Amount", width: "w-[16%]", align: "right" as const },
	{ header: "Close date", width: "w-[14%]" },
	{ header: "Owner", width: "w-[14%]" },
];

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const shortDateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

function nextClose(deals: CompanyDeal[]): string | null {
	const dates = deals
		.map((deal) => deal.expectedCloseDate)
		.filter((date): date is string => date !== null)
		.sort();
	return dates[0] ?? null;
}

function AddRow({
	label,
	columns,
	onClick,
}: {
	label: string;
	columns: number;
	onClick: () => void;
}) {
	return (
		<SimpleTableRow>
			<TableCell colSpan={columns} className="p-0">
				<Button
					variant="ghost"
					size="sm"
					onClick={onClick}
					className="h-9 w-full justify-start px-5 font-normal text-muted-foreground"
				>
					<Icon icon={Add} data-icon="inline-start" />
					{label}
				</Button>
			</TableCell>
		</SimpleTableRow>
	);
}

export function CompanySheet({ companyId }: { companyId: string }) {
	const trpc = useTRPC();
	const labels = useWorkspaceLabels();
	const {
		tab,
		setTab,
		form: adding,
		setForm: setAdding,
	} = useRecordSheetView("overview");

	const query = useQuery({
		...trpc.companies.byId.queryOptions({ id: companyId }),
		refetchInterval: (current) => {
			const record = current.state.data;
			return record && isEnriching(record.enrichmentStatus, record.queued)
				? ENRICHMENT_POLL_MS
				: false;
		},
	});

	const company = query.data;
	const researchActivity = company
		? enrichmentActivity(company.enrichmentStatus, company.queued)
		: null;

	const location = company
		? [company.city, company.stateCode, company.country]
				.filter(Boolean)
				.join(", ")
		: null;

	const openDeals =
		company?.deals.filter((deal) => OPEN_STAGES.includes(deal.stage)) ?? [];
	const openValueCents = openDeals.reduce(
		(total, deal) => total + (deal.baseAmountCents ?? 0),
		0,
	);
	const openUncounted = openDeals.filter(
		(deal) => deal.amountCents !== null && deal.baseAmountCents === null,
	).length;
	const closing = nextClose(openDeals);

	const tabs: DetailSheetTab[] = company
		? [
				{
					value: "overview",
					label: "Overview",
					content: (
						<CompanyOverview
							company={company}
							onAddContact={() => {
								setAdding("contact");
								setTab("contacts");
							}}
						/>
					),
				},
				...(labels.acquisition
					? ([
							{
								value: "acquisition",
								label: "Acquisition",
								count:
									company.acquisitionTarget?.missingInformation.length ?? 0,
								content: <AcquisitionDossier company={company} />,
							},
						] satisfies DetailSheetTab[])
					: []),
				{
					value: "contacts",
					label: "Contacts",
					count: company.contacts.length,
					content: (
						<CompanyContacts
							company={company}
							adding={adding === "contact"}
							onAdd={() => setAdding("contact")}
							onDone={() => setAdding(null)}
						/>
					),
				},
				{
					value: "deals",
					label: "Deals",
					count: company.deals.length,
					content: (
						<CompanyDeals
							company={company}
							adding={adding === "deal"}
							onAdd={() => setAdding("deal")}
							onDone={() => setAdding(null)}
						/>
					),
				},
				{
					value: "activity",
					label: "Activity",
					content: <Timeline anchor={{ companyId: company.id }} />,
				},
				{
					value: "agent",
					label: "Agent",
					content: <AgentPanel record={{ kind: "company", id: company.id }} />,
					keepMounted: true,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={company?.name ?? "Company"}
			description={
				company ? (
					<MetaLine
						lead={
							<DomainLink domain={company.domain} website={company.website} />
						}
						parts={[location, company.industry]}
					/>
				) : undefined
			}
			note={
				company &&
				(company.enrichmentStatus !== "COMPLETE" || researchActivity) ? (
					<EnrichmentIndicator
						status={company.enrichmentStatus}
						queued={company.queued}
						title={company.enrichmentError}
					/>
				) : null
			}
			media={
				<EntityLogo
					src={company?.iconUrl ?? company?.logoUrl}
					darkSrc={company?.iconDarkUrl}
					tone={company?.iconTone as EntityLogoTone | null | undefined}
					name={company?.name ?? "?"}
					size="lg"
				/>
			}
			actions={
				company ? (
					<>
						<EnrichmentActions
							companyId={company.id}
							hasDomain={company.domain !== null}
							activity={researchActivity}
							acquisition={labels.acquisition}
							queuedKinds={company.queuedKinds}
						/>
						<RecordActions
							record={{ kind: "company", id: company.id }}
							name={company.name}
							consequence={companyConsequence(company)}
						/>
					</>
				) : null
			}
			stats={
				company ? (
					<DetailSheetStats>
						{labels.acquisition ? (
							<>
								<DetailSheetStat label="Acquisition fit">
									<AcquisitionFitIndicator
										fit={
											company.acquisitionTarget?.fit ?? AcquisitionFit.UNKNOWN
										}
									/>
								</DetailSheetStat>
								<DetailSheetStat label="Lifecycle">
									<AcquisitionStageIndicator
										stage={
											company.acquisitionTarget?.stage ??
											AcquisitionStage.DISCOVERED
										}
									/>
								</DetailSheetStat>
								<DetailSheetStat label="Research freshness">
									{company.acquisitionTarget?.researchedAt ? (
										<span suppressHydrationWarning>
											{relativeTimeFromIso(
												company.acquisitionTarget.researchedAt,
											)}
										</span>
									) : (
										<EmptyCellValue />
									)}
								</DetailSheetStat>
								<DetailSheetStat label="Missing information">
									<span className="tabular-nums">
										{company.acquisitionTarget?.missingInformation.length ?? 0}
									</span>
								</DetailSheetStat>
							</>
						) : (
							<>
								<DetailSheetStat label="Open pipeline">
									<span className="tabular-nums">
										{formatMoney(openValueCents, company.reportingCurrency)}
									</span>
									{openUncounted > 0 ? (
										<span className="text-muted-foreground">
											{" "}
											+{openUncounted} unconverted
										</span>
									) : null}
								</DetailSheetStat>
								<DetailSheetStat label="Open deals">
									<span className="tabular-nums">{openDeals.length}</span>
								</DetailSheetStat>
								<DetailSheetStat label="Next close">
									{closing ? (
										shortDateFormat.format(new Date(closing))
									) : (
										<EmptyCellValue />
									)}
								</DetailSheetStat>
								<DetailSheetStat label="Owner">
									<OwnerCell owner={company.owner} />
								</DetailSheetStat>
							</>
						)}
					</DetailSheetStats>
				) : null
			}
			tabs={tabs}
			tab={tab}
			onTabChange={setTab}
		/>
	);
}

function CompanyOverview({
	company,
	onAddContact,
}: {
	company: Company;
	onAddContact: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());

	const update = useMutation(
		trpc.companies.update.mutationOptions({
			onSuccess: () => cache.company(company.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const save = (data: Record<string, string | null>) =>
		update.mutate({ id: company.id, data });

	const isSaving = savingField(update);
	const fields = pendingFields(company);
	const researchActivity = enrichmentActivity(
		company.enrichmentStatus,
		company.queued,
	);
	const detailsActivity = company.queuedKinds.some((kind) =>
		["brand", "company-details"].includes(kind),
	)
		? researchActivity
		: null;

	return (
		<DetailSheetBody>
			{detailsActivity ? (
				<DetailSheetResearchStatus
					subject={company.name}
					fields={fields}
					state={detailsActivity}
				/>
			) : null}

			<DetailSheetSplit>
				<DetailSheetMain>
					{company.description ? (
						<DetailSheetSection title="About">
							<DetailSheetProse>{company.description}</DetailSheetProse>
						</DetailSheetSection>
					) : null}

					<DetailSheetSection title="People">
						<CompanyContacts
							company={company}
							adding={false}
							onAdd={onAddContact}
							onDone={() => undefined}
						/>
					</DetailSheetSection>
				</DetailSheetMain>

				<DetailSheetRail>
					<DetailSheetSection title="Details">
						<DetailSheetProperties columns={1}>
							<InlineField
								label="Name"
								value={company.name}
								saving={isSaving("name")}
								onSave={(name) => name && save({ name })}
							/>
							<InlineField
								label="Domain"
								value={company.domain}
								type="url"
								placeholder="stripe.com"
								saving={isSaving("domain")}
								onSave={(domain) => save({ domain })}
							/>
							<InlineField
								label="Website"
								value={company.website}
								type="url"
								placeholder="https://stripe.com"
								saving={isSaving("website")}
								onSave={(website) => save({ website })}
							/>
							<InlineField
								label="Phone"
								value={company.phone}
								type="tel"
								saving={isSaving("phone")}
								onSave={(phone) => save({ phone })}
							/>
							<InlineField
								label="Email"
								value={company.email}
								type="email"
								saving={isSaving("email")}
								onSave={(email) => save({ email })}
							/>
							<InlineField
								label="City"
								value={company.city}
								saving={isSaving("city")}
								onSave={(city) => save({ city })}
							/>
							<InlineField
								label="Country"
								value={company.country}
								saving={isSaving("country")}
								onSave={(country) => save({ country })}
							/>
							<InlineSelectField
								label="Owner"
								value={company.owner?.id ?? UNASSIGNED}
								options={[
									{ value: UNASSIGNED, label: "Unassigned" },
									...(users.data ?? []).map((user) => ({
										value: user.id,
										label: user.name,
									})),
								]}
								onSave={(ownerId) =>
									save({ ownerId: ownerId === UNASSIGNED ? null : ownerId })
								}
							/>
						</DetailSheetProperties>
					</DetailSheetSection>

					{detailsActivity ? null : <DetailSheetPending fields={fields} />}

					{hasCompanyLinks(company) ? (
						<DetailSheetSection title="Links">
							<CompanySocials company={company} />
						</DetailSheetSection>
					) : null}
				</DetailSheetRail>
			</DetailSheetSplit>
		</DetailSheetBody>
	);
}

function AcquisitionDossier({ company }: { company: Company }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const target = company.acquisitionTarget;
	const stage = target?.stage ?? AcquisitionStage.DISCOVERED;
	const analysisActivity = company.queuedKinds.includes("acquisition-refresh")
		? enrichmentActivity(company.enrichmentStatus, company.queued)
		: null;

	const updateStage = useMutation(
		trpc.acquisition.updateTarget.mutationOptions({
			onSuccess: () => cache.company(company.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);
	const research = useMutation(
		trpc.companies.research.mutationOptions({
			onSuccess: async () => {
				await cache.company(company.id);
				toast.success("Acquisition research queued.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<DetailSheetBody>
			{analysisActivity ? (
				<DetailSheetResearchStatus
					subject={company.name}
					fields={[]}
					state={analysisActivity}
					mode="acquisition"
				/>
			) : null}
			<DetailSheetSplit>
				<DetailSheetMain>
					{target?.summary ? (
						<>
							<DetailSheetSection title="Assessment">
								<DetailSheetProse>{target.summary}</DetailSheetProse>
							</DetailSheetSection>

							<AcquisitionFindings
								title="Why it might fit"
								findings={target.strengths}
								empty="No supported strengths were found in this pass."
							/>

							<AcquisitionFindings
								title="Reasons for caution"
								findings={target.concerns}
								empty="No evidence-backed concern was identified in this pass."
							/>

							<DetailSheetSection title="Missing information">
								{target.missingInformation.length > 0 ? (
									<ul className="flex flex-col gap-2 text-muted-foreground text-xs/5">
										{target.missingInformation.map((item) => (
											<li key={item}>• {item}</li>
										))}
									</ul>
								) : (
									<DetailSheetProse>
										No critical gap was identified in this pass.
									</DetailSheetProse>
								)}
							</DetailSheetSection>
						</>
					) : (
						<DetailSheetEmpty
							icon={Partnership}
							title="No acquisition dossier yet"
							description="Ask Eve to compare this target with the buy box, collect evidence, identify gaps, and recommend what to do next."
							action={
								<Button
									size="sm"
									disabled={!company.domain || research.isPending}
									onClick={() => research.mutate({ id: company.id })}
								>
									{research.isPending ? "Queueing…" : "Research target"}
								</Button>
							}
						/>
					)}
				</DetailSheetMain>

				<DetailSheetRail>
					<DetailSheetSection title="Decision">
						<DetailSheetProperties columns={1}>
							<DetailSheetProperty label="Lifecycle">
								<Select
									value={stage}
									disabled={updateStage.isPending}
									onValueChange={(value) =>
										updateStage.mutate({
											companyId: company.id,
											stage: value as AcquisitionStage,
										})
									}
								>
									<SelectTrigger size="sm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{ACQUISITION_STAGES.map((value) => (
												<SelectItem key={value} value={value}>
													{acquisitionStageLabel(value)}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</DetailSheetProperty>
							<DetailSheetProperty label="Fit">
								<AcquisitionFitIndicator
									fit={target?.fit ?? AcquisitionFit.UNKNOWN}
								/>
							</DetailSheetProperty>
							<DetailSheetProperty label="Eve suggests">
								{target?.recommendedStage ? (
									<AcquisitionStageIndicator stage={target.recommendedStage} />
								) : (
									<EmptyCellValue />
								)}
							</DetailSheetProperty>
						</DetailSheetProperties>
					</DetailSheetSection>

					<DetailSheetSection title="Recommended next action">
						<DetailSheetProse>
							{target?.recommendedAction ??
								"Research this target before deciding what to do next."}
						</DetailSheetProse>
					</DetailSheetSection>

					{target && target.sourceUrls.length > 0 ? (
						<DetailSheetSection title="Sources">
							<ul className="flex flex-col gap-2 text-muted-foreground text-xs/5">
								{target.sourceUrls.map((url) => (
									<li key={url} className="truncate">
										<Link
											variant="quiet"
											href={url}
											target="_blank"
											rel="noreferrer noopener"
										>
											{sourceLabel(url)}
										</Link>
									</li>
								))}
							</ul>
						</DetailSheetSection>
					) : null}
				</DetailSheetRail>
			</DetailSheetSplit>
		</DetailSheetBody>
	);
}

function AcquisitionFindings({
	title,
	findings,
	empty,
}: {
	title: string;
	findings: NonNullable<Company["acquisitionTarget"]>["strengths"];
	empty: string;
}) {
	return (
		<DetailSheetSection title={title}>
			{findings.length === 0 ? (
				<DetailSheetProse>{empty}</DetailSheetProse>
			) : (
				<ul className="flex flex-col gap-4">
					{findings.map((finding) => (
						<li key={finding.summary} className="flex flex-col gap-1.5">
							<p className="text-pretty text-xs/5">{finding.summary}</p>
							<div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
								{finding.evidence.map((item) => (
									<Link
										key={`${item.url}-${item.label}`}
										variant="quiet"
										href={item.url}
										target="_blank"
										rel="noreferrer noopener"
									>
										{item.label}
									</Link>
								))}
							</div>
						</li>
					))}
				</ul>
			)}
		</DetailSheetSection>
	);
}

function sourceLabel(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "Source";
	}
}

function CompanyContacts({
	company,
	adding,
	onAdd,
	onDone,
}: {
	company: Company;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const setPrimary = useMutation(
		trpc.companies.setPrimaryContact.mutationOptions({
			onSuccess: () => cache.company(company.id),
			onError: (error) => toast.error(error.message),
		}),
	);

	const form = adding ? (
		<QuickAddContact
			companyId={company.id}
			ownerId={company.owner?.id ?? null}
			onDone={onDone}
		/>
	) : null;

	if (company.contacts.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={UserMultiple}
						title="No contacts yet"
						description={`Everyone you talk to at ${company.name} lives here — add the first person and their calls, emails and notes hang off them.`}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={Add} data-icon="inline-start" />
								Add contact
							</Button>
						}
					/>
				)}
			</>
		);
	}

	return (
		<>
			{form}
			<SimpleTable variant="panel" columns={CONTACT_COLUMNS}>
				{company.contacts.map((contact) => {
					const isPrimary = contact.id === company.primaryContactId;
					return (
						<SimpleTableRow
							key={contact.id}
							clickable
							onClick={() => openRecord({ kind: "contact", id: contact.id })}
						>
							<TableCell className="w-10 py-2.5 pl-5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-xs"
											aria-pressed={isPrimary}
											disabled={isPrimary || setPrimary.isPending}
											onClick={(event) => {
												event.stopPropagation();
												setPrimary.mutate({
													companyId: company.id,
													contactId: contact.id,
												});
											}}
										>
											<Icon icon={isPrimary ? StarFilled : Star} />
											<span className="sr-only">
												{isPrimary ? "Primary contact" : "Make primary"}
											</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{isPrimary ? "Primary contact" : "Make primary"}
									</TooltipContent>
								</Tooltip>
							</TableCell>
							<TableCell className="truncate px-3 py-2.5 font-medium">
								<span className="flex min-w-0 items-center gap-2">
									<PersonAvatar
										src={contact.imageUrl}
										name={[contact.firstName, contact.lastName]
											.filter(Boolean)
											.join(" ")}
										email={contact.email}
										size="sm"
									/>
									<span className="truncate">
										{[contact.firstName, contact.lastName]
											.filter(Boolean)
											.join(" ")}
									</span>
								</span>
							</TableCell>
							<TableCell className="truncate px-3 py-2.5">
								{contact.title ?? <EmptyCellValue />}
							</TableCell>
							<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
								{contact.email ?? <EmptyCellValue />}
							</TableCell>
							<TableCell className="px-3 py-2.5">
								<OwnerCell owner={contact.owner} />
							</TableCell>
						</SimpleTableRow>
					);
				})}

				<AddRow
					label="Add contact"
					columns={CONTACT_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}

function CompanyDeals({
	company,
	adding,
	onAdd,
	onDone,
}: {
	company: Company;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const openRecord = useOpenRecord();

	const form = adding ? (
		<QuickAddDeal
			companyId={company.id}
			companyName={company.name}
			ownerId={company.owner?.id ?? null}
			onDone={onDone}
		/>
	) : null;

	if (company.deals.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={Partnership}
						title="No deals yet"
						description={`Nothing is being sold to ${company.name} right now. Open one and it joins the pipeline and the forecast.`}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={Add} data-icon="inline-start" />
								New deal
							</Button>
						}
					/>
				)}
			</>
		);
	}

	return (
		<>
			{form}
			<SimpleTable variant="panel" columns={DEAL_COLUMNS}>
				{company.deals.map((deal) => (
					<SimpleTableRow
						key={deal.id}
						clickable
						onClick={() => openRecord({ kind: "deal", id: deal.id })}
					>
						<TableCell className="truncate py-2.5 pr-3 pl-5 font-medium">
							{deal.name}
						</TableCell>
						<TableCell className="px-3 py-2.5">
							<DealStageMenu dealId={deal.id} stage={deal.stage} />
						</TableCell>
						<TableCell className="px-3 py-2.5 text-right">
							<DealAmount
								amountCents={deal.amountCents}
								currency={deal.currency}
							/>
						</TableCell>
						<TableCell className="px-3 py-2.5 text-muted-foreground">
							{deal.expectedCloseDate ? (
								dateFormat.format(new Date(deal.expectedCloseDate))
							) : (
								<EmptyCellValue />
							)}
						</TableCell>
						<TableCell className="px-3 py-2.5">
							<OwnerCell owner={deal.owner} />
						</TableCell>
					</SimpleTableRow>
				))}

				<AddRow
					label="New deal"
					columns={DEAL_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}
