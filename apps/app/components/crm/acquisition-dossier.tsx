"use client";

import Partnership from "@carbon/icons-react/es/Partnership";
import {
	type AcquisitionCriterionAssessment,
	isTargetLifecycleStage,
} from "@crm/db/acquisition";
import type { AcquisitionStage } from "@crm/db/enums";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Link as TextLink } from "@crm/ui/components/link";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { relativeTimeFromIso } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId } from "react";
import { toast } from "sonner";
import {
	TARGET_LIFECYCLE_STAGES,
	AcquisitionFitIndicator,
	acquisitionStageLabel,
	type TargetLifecycleStage,
} from "@/components/crm/acquisition-status";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetMain,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetProse,
	DetailSheetRail,
	DetailSheetSection,
	DetailSheetSplit,
} from "@/components/detail-sheet";
import {
	acquisitionCriterionLabel,
	acquisitionProfileDossierReady,
	criterionGroups,
	safeAcquisitionEvidence,
	targetResearchCopy,
} from "@/lib/acquisition";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Company = RouterOutputs["companies"]["byId"];
type Target = NonNullable<Company["acquisitionTarget"]>;
type Finding = Target["strengths"][number];

const CRITERION_PRESENTATION = {
	MATCH: { label: "Matches", tone: "success" as const },
	PARTIAL: { label: "Partial", tone: "info" as const },
	CONCERN: { label: "Concern", tone: "warning" as const },
	UNKNOWN: { label: "Unknown", tone: "neutral" as const },
};

export function AcquisitionDossier({
	company,
	onAddDomain,
}: {
	company: Company;
	onAddDomain: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const target = company.acquisitionTarget;
	const acquisitionProfile = useQuery(
		trpc.workspace.acquisitionProfile.queryOptions(),
	);

	const updateStage = useMutation(
		trpc.acquisition.updateTarget.mutationOptions({
			onSuccess: () => cache.acquisition(company.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);
	const acceptRecommendedStage = useMutation(
		trpc.acquisition.acceptRecommendedStage.mutationOptions({
			onSuccess: () => {
				cache.acquisition(company.id, { settle: "record" });
				toast.success("Stage recommendation applied.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const dismissRecommendedStage = useMutation(
		trpc.acquisition.dismissRecommendedStage.mutationOptions({
			onSuccess: () => {
				cache.acquisition(company.id, { settle: "record" });
				toast.success("Stage recommendation dismissed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const acceptRecommendedAction = useMutation(
		trpc.acquisition.acceptRecommendedAction.mutationOptions({
			onSuccess: () => {
				cache.acquisition(company.id, { settle: "record" });
				toast.success("Task created from Eve recommendation.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const dismissRecommendedAction = useMutation(
		trpc.acquisition.dismissRecommendedAction.mutationOptions({
			onSuccess: () => {
				cache.acquisition(company.id, { settle: "record" });
				toast.success("Action recommendation dismissed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const research = useMutation(
		trpc.companies.research.mutationOptions({
			onSuccess: async () => {
				await cache.acquisition(company.id);
				toast.success("Acquisition research queued.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!target) return null;

	const buyBoxReady = acquisitionProfile.data
		? acquisitionProfileDossierReady(acquisitionProfile.data)
		: null;
	const readinessState = !company.domain
		? ({ status: "blocked", blocker: "missing-domain" } as const)
		: buyBoxReady === false
			? ({ status: "blocked", blocker: "missing-buy-box" } as const)
			: null;
	const researchCopy = targetResearchCopy(company.acquisitionResearch);
	const readinessCopy = readinessState
		? targetResearchCopy(readinessState)
		: null;
	const groups = criterionGroups(target.criteria);
	const pendingStageRecommendation =
		target.recommendedStage &&
		target.recommendedStage !== target.stage &&
		isTargetLifecycleStage(target.recommendedStage)
			? target.recommendedStage
			: null;
	const recommendationPending =
		acceptRecommendedStage.isPending ||
		dismissRecommendedStage.isPending ||
		acceptRecommendedAction.isPending ||
		dismissRecommendedAction.isPending;

	return (
		<DetailSheetBody>
			<DetailSheetSplit>
				<DetailSheetMain>
					<DetailSheetSection title="Criteria matrix">
						{target.criteria.length > 0 ? (
							<DetailSheetProperties columns={1}>
								{target.criteria.map((criterion) => (
									<DetailSheetProperty
										key={criterion.id}
										label={acquisitionCriterionLabel(criterion.id)}
									>
										<CriterionResult criterion={criterion} />
									</DetailSheetProperty>
								))}
							</DetailSheetProperties>
						) : (
							<DetailSheetProse>
								No criterion assessment has completed yet.
							</DetailSheetProse>
						)}
					</DetailSheetSection>
				</DetailSheetMain>

				<DetailSheetRail>
					<DetailSheetSection title="Fit against the buy box">
						<AcquisitionFitIndicator fit={target.fit} />
					</DetailSheetSection>
				</DetailSheetRail>
			</DetailSheetSplit>

			<DetailSheetSection title="Research">
				<DetailSheetProperties columns={2}>
					<DetailSheetProperty label="Last successful research">
						{target.researchedAt ? (
							<span suppressHydrationWarning>
								{relativeTimeFromIso(target.researchedAt)}
							</span>
						) : (
							<EmptyCellValue />
						)}
					</DetailSheetProperty>
					<DetailSheetProperty label="Current task">
						<StatusIndicator
							tone={researchCopy.tone}
							busy={researchCopy.busy}
							pulse={researchCopy.pulse}
							label={researchCopy.label}
						/>
					</DetailSheetProperty>
				</DetailSheetProperties>

				{company.acquisitionResearch.status !== "idle" ? (
					<Alert
						variant={
							company.acquisitionResearch.status === "failed"
								? "destructive"
								: "default"
						}
					>
						<AlertTitle>{researchCopy.label}</AlertTitle>
						<AlertDescription>{researchCopy.description}</AlertDescription>
						{researchCopy.action ? (
							<AlertAction>
								<ResearchAction
									action={researchCopy.action}
									buyBoxHref={workspaceUrl("/settings/buy-box")}
									pending={research.isPending}
									onAddDomain={onAddDomain}
									onRetry={() => research.mutate({ id: company.id })}
								/>
							</AlertAction>
						) : null}
					</Alert>
				) : null}

				{readinessCopy?.action ? (
					<Alert>
						<AlertTitle>{readinessCopy.label}</AlertTitle>
						<AlertDescription>{readinessCopy.description}</AlertDescription>
						<AlertAction>
							<ResearchAction
								action={readinessCopy.action}
								buyBoxHref={workspaceUrl("/settings/buy-box")}
								pending={research.isPending}
								onAddDomain={onAddDomain}
								onRetry={() => research.mutate({ id: company.id })}
							/>
						</AlertAction>
					</Alert>
				) : null}
			</DetailSheetSection>

			{groups.blockers.length > 0 ? (
				<CriterionGroup
					title="Qualification blockers"
					criteria={groups.blockers}
				/>
			) : null}
			{groups.assessments.length > 0 ? (
				<CriterionGroup
					title="Criterion findings"
					criteria={groups.assessments}
				/>
			) : null}
			{groups.unknowns.length > 0 ? (
				<CriterionGroup title="Other unknowns" criteria={groups.unknowns} />
			) : null}

			{target.summary ? (
				<>
					<DetailSheetSection title="Assessment">
						<DetailSheetProse>{target.summary}</DetailSheetProse>
					</DetailSheetSection>

					<AcquisitionFindings
						title="Strengths"
						findings={target.strengths}
						empty="No supported strengths were found in this pass."
					/>

					<AcquisitionFindings
						title="Concerns"
						findings={target.concerns}
						empty="No evidence-backed concern was identified in this pass."
					/>

					<DetailSheetSection title="Unknowns">
						{target.missingInformation.length > 0 ? (
							<ul className="flex flex-col gap-2 text-muted-foreground text-xs/5">
								{target.missingInformation.map((item) => (
									<li key={item}>{item}</li>
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
					title="No acquisition assessment yet"
					description="Research compares this target with the buy box, records supported findings, and names the next decision."
					action={
						company.acquisitionResearch.status === "idle" &&
						readinessState === null &&
						buyBoxReady === true ? (
							<Button
								size="sm"
								disabled={research.isPending}
								onClick={() => research.mutate({ id: company.id })}
							>
								Research target
							</Button>
						) : undefined
					}
				/>
			)}

			<DetailSheetSection title="Recommended next action">
				<DetailSheetProse>
					{target.recommendedAction ??
						"Research this target before deciding what to do next."}
				</DetailSheetProse>
				{target.recommendedAction ? (
					<div className="mt-3 flex flex-wrap gap-2">
						<Button
							size="sm"
							disabled={recommendationPending}
							onClick={() =>
								acceptRecommendedAction.mutate({ companyId: company.id })
							}
						>
							Create task
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={recommendationPending}
							onClick={() =>
								dismissRecommendedAction.mutate({ companyId: company.id })
							}
						>
							Dismiss
						</Button>
					</div>
				) : null}
			</DetailSheetSection>

			{pendingStageRecommendation ? (
				<Alert>
					<AlertTitle>Eve recommends a lifecycle change</AlertTitle>
					<AlertDescription>
						Move this target to{" "}
						{acquisitionStageLabel(pendingStageRecommendation)}.
					</AlertDescription>
					<AlertAction>
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								disabled={recommendationPending}
								onClick={() =>
									acceptRecommendedStage.mutate({ companyId: company.id })
								}
							>
								Accept recommendation
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={recommendationPending}
								onClick={() =>
									dismissRecommendedStage.mutate({ companyId: company.id })
								}
							>
								Dismiss
							</Button>
						</div>
					</AlertAction>
				</Alert>
			) : null}

			<DetailSheetSection title="Lifecycle">
				<DetailSheetProperties columns={1}>
					<LifecycleControl
						stage={target.stage}
						pending={updateStage.isPending}
						onStageChange={(stage) =>
							updateStage.mutate({ companyId: company.id, stage })
						}
					/>
				</DetailSheetProperties>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

export function LifecycleControl({
	stage,
	pending,
	onStageChange,
}: {
	stage: AcquisitionStage;
	pending: boolean;
	onStageChange: (stage: TargetLifecycleStage) => void;
}) {
	const labelId = useId();
	const statusId = useId();
	const lifecycleOptions: AcquisitionStage[] = TARGET_LIFECYCLE_STAGES.includes(
		stage as TargetLifecycleStage,
	)
		? [...TARGET_LIFECYCLE_STAGES]
		: [...TARGET_LIFECYCLE_STAGES, stage];

	return (
		<DetailSheetProperty
			label={
				<Tooltip>
					<TooltipTrigger asChild>
						<Button id={labelId} type="button" variant="ghost" size="xs">
							Lifecycle
						</Button>
					</TooltipTrigger>
					<TooltipContent>Manually controlled</TooltipContent>
				</Tooltip>
			}
		>
			<div className="flex flex-col items-start gap-1">
				<Select
					value={stage}
					disabled={pending}
					onValueChange={(value) =>
						onStageChange(value as TargetLifecycleStage)
					}
				>
					<SelectTrigger
						size="sm"
						aria-labelledby={labelId}
						aria-describedby={statusId}
						aria-busy={pending}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{lifecycleOptions.map((option) => (
								<SelectItem key={option} value={option}>
									{acquisitionStageLabel(option)}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<span
					id={statusId}
					role="status"
					aria-live="polite"
					className="text-muted-foreground text-xs"
				>
					{pending ? "Saving lifecycle" : null}
				</span>
			</div>
		</DetailSheetProperty>
	);
}

function CriterionResult({
	criterion,
}: {
	criterion: AcquisitionCriterionAssessment;
}) {
	const presentation = CRITERION_PRESENTATION[criterion.result];
	return (
		<StatusIndicator
			tone={criterion.blocksQualification ? "warning" : presentation.tone}
			label={presentation.label}
		/>
	);
}

function CriterionGroup({
	title,
	criteria,
}: {
	title: string;
	criteria: AcquisitionCriterionAssessment[];
}) {
	return (
		<DetailSheetSection title={title}>
			<div className="flex flex-col gap-4">
				{criteria.map((criterion) => (
					<div key={criterion.id} className="flex flex-col gap-1.5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="font-medium text-xs">
								{acquisitionCriterionLabel(criterion.id)}
							</p>
							<CriterionResult criterion={criterion} />
						</div>
						<DetailSheetProse>{criterion.explanation}</DetailSheetProse>
						{safeAcquisitionEvidence(criterion.evidence).length > 0 ? (
							<div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
								{safeAcquisitionEvidence(criterion.evidence).map((evidence) => (
									<TextLink
										key={`${evidence.url}-${evidence.label}`}
										variant="quiet"
										href={evidence.url}
										target="_blank"
										rel="noreferrer noopener"
									>
										{evidence.label}
									</TextLink>
								))}
							</div>
						) : null}
					</div>
				))}
			</div>
		</DetailSheetSection>
	);
}

function AcquisitionFindings({
	title,
	findings,
	empty,
}: {
	title: string;
	findings: Finding[];
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
								{safeAcquisitionEvidence(finding.evidence).map((evidence) => (
									<TextLink
										key={`${evidence.url}-${evidence.label}`}
										variant="quiet"
										href={evidence.url}
										target="_blank"
										rel="noreferrer noopener"
									>
										{evidence.label}
									</TextLink>
								))}
							</div>
						</li>
					))}
				</ul>
			)}
		</DetailSheetSection>
	);
}

function ResearchAction({
	action,
	buyBoxHref,
	pending,
	onAddDomain,
	onRetry,
}: {
	action: NonNullable<ReturnType<typeof targetResearchCopy>["action"]>;
	buyBoxHref: string;
	pending: boolean;
	onAddDomain: () => void;
	onRetry: () => void;
}) {
	if (action.kind === "buy-box") {
		return (
			<Button asChild variant="outline" size="sm">
				<Link href={buyBoxHref}>{action.label}</Link>
			</Button>
		);
	}

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={pending}
			onClick={action.kind === "domain" ? onAddDomain : onRetry}
		>
			{action.label}
		</Button>
	);
}
