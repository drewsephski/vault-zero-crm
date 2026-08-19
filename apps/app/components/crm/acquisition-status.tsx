import { type AcquisitionFit, AcquisitionStage } from "@crm/db/enums";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";

export const TARGET_LIFECYCLE_STAGES = [
	AcquisitionStage.DISCOVERED,
	AcquisitionStage.QUALIFIED,
	AcquisitionStage.WATCHLIST,
	AcquisitionStage.REJECTED,
	AcquisitionStage.ACQUIRED,
] as const;

export type TargetLifecycleStage = (typeof TARGET_LIFECYCLE_STAGES)[number];

export const ACQUISITION_STAGES = TARGET_LIFECYCLE_STAGES;

const STAGE_LABELS: Record<AcquisitionStage, string> = {
	DISCOVERED: "Discovered",
	RESEARCHING: "Researching",
	QUALIFIED: "Qualified",
	WATCHLIST: "Watchlist",
	CONTACTED: "Contacted",
	INTERESTED: "Interested",
	OPPORTUNITY: "Opportunity",
	DILIGENCE: "Diligence",
	REJECTED: "Rejected",
	ACQUIRED: "Acquired",
};

const FIT_PRESENTATION: Record<
	AcquisitionFit,
	{ label: string; tone: StatusTone }
> = {
	UNKNOWN: { label: "Not assessed", tone: "neutral" },
	STRONG: { label: "Strong fit", tone: "success" },
	POTENTIAL: { label: "Potential fit", tone: "info" },
	WEAK: { label: "Weak fit", tone: "warning" },
	DISQUALIFIED: { label: "Not a fit", tone: "error" },
};

export function acquisitionStageLabel(stage: AcquisitionStage): string {
	return STAGE_LABELS[stage];
}

export function AcquisitionFitIndicator({ fit }: { fit: AcquisitionFit }) {
	const presentation = FIT_PRESENTATION[fit];
	return (
		<StatusIndicator tone={presentation.tone} label={presentation.label} />
	);
}

export function AcquisitionStageIndicator({
	stage,
}: {
	stage: AcquisitionStage;
}) {
	const tone: StatusTone =
		stage === AcquisitionStage.ACQUIRED
			? "success"
			: stage === AcquisitionStage.REJECTED
				? "error"
				: stage === AcquisitionStage.DILIGENCE ||
						stage === AcquisitionStage.OPPORTUNITY
					? "info"
					: "neutral";
	return <StatusIndicator tone={tone} label={STAGE_LABELS[stage]} />;
}
