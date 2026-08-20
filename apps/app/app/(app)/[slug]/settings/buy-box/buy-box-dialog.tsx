"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import type { ComponentProps } from "react";
import { useState } from "react";
import { BuyBoxForm } from "./buy-box-form";

export function BuyBoxDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-0 p-0 sm:max-w-2xl">
				<DialogHeader className="border-b px-4 py-4">
					<DialogTitle>Buy box</DialogTitle>
					<DialogDescription>
						Define what this workspace wants to acquire. Eve uses these criteria
						for screening and discovery.
					</DialogDescription>
				</DialogHeader>
				<div className="px-4 pb-4">
					<BuyBoxForm
						presentation="inline"
						onSaved={() => onOpenChange(false)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function BuyBoxSetupButton({
	children = "Set up your buy box",
	size = "sm",
	...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
	children?: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button size={size} onClick={() => setOpen(true)} {...props}>
				{children}
			</Button>
			<BuyBoxDialog open={open} onOpenChange={setOpen} />
		</>
	);
}
