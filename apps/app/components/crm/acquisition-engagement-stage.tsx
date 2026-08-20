import { AcquisitionEngagementStage } from "@crm/db/enums";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";

export const ACTIVE_ENGAGEMENT_STAGES = [
	AcquisitionEngagementStage.OUTREACH,
	AcquisitionEngagementStage.ENGAGED,
	AcquisitionEngagementStage.NDA,
	AcquisitionEngagementStage.MATERIALS_RECEIVED,
	AcquisitionEngagementStage.UNDERWRITING,
	AcquisitionEngagementStage.LOI,
	AcquisitionEngagementStage.DILIGENCE,
	AcquisitionEngagementStage.FINANCING,
	AcquisitionEngagementStage.CLOSING,
] as const;

const PRESENTATION: Record<
	AcquisitionEngagementStage,
	{ label: string; tone: StatusTone }
> = {
	OUTREACH: { label: "Outreach", tone: "neutral" },
	ENGAGED: { label: "Engaged", tone: "info" },
	NDA: { label: "NDA", tone: "info" },
	MATERIALS_RECEIVED: { label: "Materials received", tone: "info" },
	UNDERWRITING: { label: "Underwriting", tone: "warning" },
	LOI: { label: "LOI", tone: "warning" },
	DILIGENCE: { label: "Diligence", tone: "warning" },
	FINANCING: { label: "Financing", tone: "warning" },
	CLOSING: { label: "Closing", tone: "success" },
	ACQUIRED: { label: "Acquired", tone: "success" },
	PASSED: { label: "Passed", tone: "error" },
};

export const ACQUISITION_ENGAGEMENT_STAGE_OPTIONS = (
	Object.values(AcquisitionEngagementStage) as AcquisitionEngagementStage[]
).map((value) => ({
	value,
	label: PRESENTATION[value].label,
}));

export const ACTIVE_ACQUISITION_ENGAGEMENT_STAGE_OPTIONS =
	ACTIVE_ENGAGEMENT_STAGES.map((value) => ({
		value,
		label: PRESENTATION[value].label,
	}));

export function acquisitionEngagementStageLabel(
	stage: AcquisitionEngagementStage,
): string {
	return PRESENTATION[stage].label;
}

export function isTerminalEngagementStage(
	stage: AcquisitionEngagementStage,
): boolean {
	return (
		stage === AcquisitionEngagementStage.ACQUIRED ||
		stage === AcquisitionEngagementStage.PASSED
	);
}

export function showsAcquisitionEngagementStageMenu(
	status: "ACTIVE" | "TERMINAL",
): boolean {
	return status === "ACTIVE";
}

export function AcquisitionEngagementStageIndicator({
	stage,
	className,
}: {
	stage: AcquisitionEngagementStage;
	className?: string;
}) {
	const { label, tone } = PRESENTATION[stage];
	return <StatusIndicator tone={tone} label={label} className={className} />;
}
