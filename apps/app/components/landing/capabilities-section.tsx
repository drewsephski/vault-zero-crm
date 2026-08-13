import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { AskCard } from "./ask-card";
import {
	BentoCard,
	CardBody,
	CardHeading,
	CardTitle,
	MonoLabel,
} from "./bento-card";
import { SectionHeading } from "./section-heading";

const ENRICHMENT_ROWS = [
	{
		name: "Commercial HVAC target",
		domain: "Owner identified · 18 years",
		logo: "HV",
		researching: false,
	},
	{
		name: "Regional roofing target",
		domain: "Repeat customers · 22 employees",
		logo: "RF",
		researching: false,
	},
	{
		name: "Fire protection target",
		domain: "Ownership under review",
		logo: "FP",
		researching: true,
	},
];

const SUGGESTED_AGENTS = [
	"Find owner-operated HVAC businesses in our region",
	"Flag targets with stale or missing research",
	"Rank qualified companies by evidence-backed fit",
];

const FOLLOW_UPS = [
	{ label: "Refresh qualified targets", due: "today", next: true },
	{ label: "Find missing owners", due: "2d", next: false },
	{ label: "Recheck watchlist", due: "30d", next: false },
];

export function CapabilitiesSection() {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20 pb-20 md:pb-30">
			<div className="flex w-full max-w-6xl flex-col gap-12 md:gap-[72px]">
				<SectionHeading title="What it actually does" />

				<div className="flex flex-col gap-4 lg:flex-row">
					<div className="flex min-w-0 grow flex-col gap-4">
						<EnrichmentCard />
						<div className="flex flex-col gap-4 sm:flex-row">
							<AgentBuilderCard />
							<FollowUpCard />
						</div>
					</div>

					<div className="flex w-full shrink-0 flex-col gap-4 lg:w-[400px]">
						<AskCard />
					</div>
				</div>
			</div>
		</section>
	);
}

function EnrichmentCard() {
	return (
		<BentoCard className="gap-6">
			<CardHeading
				title="Targets become decision-ready"
				body="Eve turns sourced businesses into structured dossiers with evidence, risks, gaps, and a recommended next action."
			/>

			<div className="flex select-none flex-col">
				{ENRICHMENT_ROWS.map((row) => (
					<div
						key={row.name}
						className="-mx-2 flex h-11 shrink-0 items-center gap-3 rounded-sm border-border border-t px-2 transition-colors hover:bg-muted/50"
					>
						<span
							className={cn(
								"flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted font-medium text-[8px] text-muted-foreground",
								row.researching && "animate-pulse",
							)}
						>
							{row.logo}
						</span>
						<span className="min-w-0 grow font-medium text-[13px]/4">
							{row.name}
						</span>
						<span className="hidden w-[180px] shrink-0 font-mono text-muted-foreground text-xs sm:block">
							{row.domain}
						</span>
						{row.researching ? (
							<StatusBadge className="gap-1 bg-border text-muted-foreground">
								<ResearchingSpinner />
								Researching
							</StatusBadge>
						) : (
							<StatusBadge className="bg-primary text-primary-foreground">
								Qualified
							</StatusBadge>
						)}
					</div>
				))}
			</div>
		</BentoCard>
	);
}

function AgentBuilderCard() {
	return (
		<BentoCard className="min-w-0 grow gap-5">
			<CardTitle>Your buy box drives the work</CardTitle>
			<CardBody>
				Industries, geography, economics, ownership preferences, and thesis
				become the shared standard for discovery and qualification.
			</CardBody>

			<div className="flex select-none flex-col">
				<MonoLabel className="h-[26px] shrink-0">SUGGESTED AGENTS</MonoLabel>
				{SUGGESTED_AGENTS.map((agent) => (
					<div
						key={agent}
						className="flex h-11 shrink-0 items-center gap-3 border-border border-t"
					>
						<span className="min-w-0 grow font-medium text-[13px]/[18px]">
							{agent}
						</span>
						<ArrowRight size={14} className="shrink-0 text-muted-foreground" />
					</div>
				))}
			</div>
		</BentoCard>
	);
}

function FollowUpCard() {
	return (
		<BentoCard className="min-w-0 grow gap-5">
			<CardTitle>Research stays current</CardTitle>

			<ul className="flex select-none flex-col gap-[14px]">
				{FOLLOW_UPS.map((item) => (
					<li key={item.label} className="flex items-center gap-2.5">
						<span
							className={cn(
								"size-[7px] shrink-0 rounded-full",
								item.next ? "animate-pulse bg-primary" : "bg-[#3A3A3A]",
							)}
						/>
						<span
							className={cn(
								"min-w-0 grow text-[13px]/[18px]",
								item.next ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{item.label}
						</span>
						<span className="shrink-0 font-mono text-[11px]/[18px] text-[#6E6E6E]">
							{item.due}
						</span>
					</li>
				))}
			</ul>

			<div className="flex flex-col gap-2 pt-1">
				<MonoLabel>WHY</MonoLabel>
				<p className="text-[13px]/[21px] text-muted-foreground">
					Every dossier shows when it was researched, what is still unknown, and
					why Eve plans to return.
				</p>
			</div>
		</BentoCard>
	);
}

function StatusBadge({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<span
			className={cn(
				"flex w-[104px] shrink-0 items-center justify-center rounded-sm px-2 py-[3px] text-[11px]/[14px]",
				className,
			)}
		>
			{children}
		</span>
	);
}

function ResearchingSpinner() {
	return (
		<svg
			viewBox="0 0 16 16"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			className="size-[11px] shrink-0 animate-spin"
		>
			<circle
				cx="8"
				cy="8"
				r="6"
				fill="none"
				stroke="#4A4A4A"
				strokeWidth="2"
			/>
			<path
				d="M8 2a6 6 0 0 1 6 6"
				fill="none"
				stroke="var(--ring)"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}
