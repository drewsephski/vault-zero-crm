import Add from "@carbon/icons-react/es/Add";
import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import Attachment from "@carbon/icons-react/es/Attachment";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import Renew from "@carbon/icons-react/es/Renew";
import Time from "@carbon/icons-react/es/Time";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { Chip } from "./chip";
import { SectionHeading } from "./section-heading";

export function AgentSection() {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20 md:pt-30">
			<div className="flex w-full max-w-6xl flex-col gap-12">
				<SectionHeading
					title="An acquisition analyst that keeps working."
					lede="Give Eve a sourcing objective. The durable task continues even after you close the browser."
				/>

				<div className="flex w-full flex-col items-center gap-7 rounded-xl border border-border bg-background px-6 py-12 md:px-12 md:py-[88px]">
					<p className="text-balance text-center font-medium text-2xl/8 tracking-[-0.01em] md:text-[32px]/10">
						What should we investigate next?
					</p>

					<Composer />
					<SuggestedActions />
				</div>
			</div>
		</section>
	);
}

function Composer() {
	return (
		<div className="flex min-h-24 w-3xl max-w-full shrink-0 select-none flex-col justify-between rounded-lg border border-[#3D3D3D] bg-muted p-[11px]">
			<p className="flex flex-wrap items-center gap-1 p-1 text-[13px]/6">
				<span className="text-[#00805E]">/Research</span>
				<span className="text-white">Find 20</span>
				<Chip className="text-white">HVAC businesses</Chip>
				<span className="text-white">in</span>
				<Chip className="text-white">Northern Illinois</Chip>
				<span className="text-white">and rank the five worth contacting.</span>
			</p>

			<div className="flex items-center">
				<div className="flex items-center gap-[14px] text-muted-foreground">
					<Add size={16} />
					<Attachment size={16} />
					<span className="font-mono text-sm/4">/</span>
				</div>
				<div className="grow" />
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary">
					<ArrowUp size={14} className="text-primary-foreground" />
				</span>
			</div>
		</div>
	);
}

function SuggestedActions() {
	return (
		<div className="flex w-3xl max-w-full shrink-0 select-none flex-col pt-1">
			<div className="flex h-7 shrink-0 items-center gap-1.5 text-muted-foreground">
				<span className="text-[13px]/4">Suggested actions</span>
				<ChevronDown size={12} />
			</div>

			<SuggestedAction>
				<span className="shrink-0">Research every target missing</span>
				<Chip>owner information</Chip>
			</SuggestedAction>

			<SuggestedAction className="gap-3">
				<span className="min-w-0 grow">
					Compare our three strongest targets
				</span>
				<Chip>by fit and risk</Chip>
			</SuggestedAction>

			<SuggestedAction>
				<span className="shrink-0">Every Monday,</span>
				<Chip className="px-2">
					<Renew size={13} className="shrink-0" />
					refresh targets
				</Chip>
				<span className="shrink-0">whose research is older than</span>
				<Chip className="px-2">
					<Time size={13} className="shrink-0 text-muted-foreground" />
					30 days
				</Chip>
			</SuggestedAction>
		</div>
	);
}

function SuggestedAction({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 border-border border-t py-[13px] text-[13px]/4">
			<span
				className={cn(
					"flex min-w-0 grow flex-wrap items-center gap-x-1.5 gap-y-2",
					className,
				)}
			>
				{children}
			</span>
			<ArrowRight size={16} className="shrink-0 text-muted-foreground" />
		</div>
	);
}
