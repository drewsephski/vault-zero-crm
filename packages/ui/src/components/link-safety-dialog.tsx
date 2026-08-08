"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Copy from "@carbon/icons-react/es/Copy";
import Email from "@carbon/icons-react/es/Email";
import Launch from "@carbon/icons-react/es/Launch";
import Link from "@carbon/icons-react/es/Link";
import Phone from "@carbon/icons-react/es/Phone";
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
import { type CarbonIcon, Icon } from "@crm/ui/components/icon";
import { describeLinkDestination } from "@crm/ui/lib/link-destination";
import { useEffect, useRef, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

const ICONS: Record<
	ReturnType<typeof describeLinkDestination>["type"],
	CarbonIcon
> = {
	email: Email,
	phone: Phone,
	web: Launch,
	other: Link,
};

export function LinkSafetyDialog({
	isOpen,
	onClose,
	onConfirm,
	url,
}: {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	url: string;
}) {
	const destination = describeLinkDestination(url);
	const [copyState, setCopyState] = useState<CopyState>("idle");
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const DestinationIcon = ICONS[destination.type];
	const ActionIcon = destination.type === "other" ? Link : DestinationIcon;

	useEffect(() => {
		setCopyState("idle");
	}, [url, isOpen]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(destination.display);
			setCopyState("copied");
		} catch {
			setCopyState("failed");
		}
	};

	const copyLabel =
		copyState === "copied"
			? "Copied"
			: copyState === "failed"
				? "Retry copy"
				: "Copy";

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<AlertDialogContent
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					returnFocusRef.current?.focus();
					returnFocusRef.current = null;
				}}
				onOpenAutoFocus={() => {
					returnFocusRef.current =
						document.activeElement instanceof HTMLElement
							? document.activeElement
							: null;
				}}
				size="compact"
			>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<span className="flex items-center gap-2">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
								<Icon icon={DestinationIcon} motion="none" />
							</span>
							{destination.title}
						</span>
					</AlertDialogTitle>
					<AlertDialogDescription>
						{destination.description}
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/50 p-2.5">
					<div className="min-w-0 flex-1">
						<p className="text-[11px] text-muted-foreground">
							{destination.label}
						</p>
						<p className="wrap-anywhere font-mono text-xs/relaxed text-foreground">
							{destination.display}
						</p>
					</div>
					<Button
						aria-label={`${copyLabel} ${destination.label.toLowerCase()}`}
						onClick={copy}
						size="icon-sm"
						title={`${copyLabel} ${destination.label.toLowerCase()}`}
						type="button"
						variant="outline"
					>
						<Icon
							icon={copyState === "copied" ? Checkmark : Copy}
							motion="none"
						/>
					</Button>
				</div>

				<span aria-live="polite" className="sr-only" role="status">
					{copyState === "copied"
						? `${destination.label} copied to clipboard.`
						: copyState === "failed"
							? `Could not copy ${destination.label.toLowerCase()}.`
							: ""}
				</span>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						<Icon icon={ActionIcon} />
						{destination.action}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
