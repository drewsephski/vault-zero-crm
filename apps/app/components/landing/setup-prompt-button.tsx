"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Copy from "@carbon/icons-react/es/Copy";
import { Button } from "@crm/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";
import { type CtaLocation, captureLanding } from "./analytics";
import { SETUP_PROMPT } from "./setup-prompt";

export function SetupPromptButton({ location }: { location: CtaLocation }) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			if (!navigator.clipboard) throw new Error("Clipboard unavailable");
			await navigator.clipboard.writeText(SETUP_PROMPT);
			captureLanding("setup_prompt_copied", location);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Unable to copy the setup prompt. Try again.");
		}
	}

	return (
		<Button
			variant="outline"
			size="xl"
			onClick={copy}
			aria-label={
				copied ? "Setup prompt copied to clipboard" : "Copy setup prompt"
			}
		>
			<Copy data-icon="inline-start" className="size-4" />
			{copied ? "Copied to clipboard" : "Copy setup prompt"}
			{copied ? (
				<Checkmark
					data-icon="inline-end"
					className="ml-1.5 size-3.5 text-primary"
				/>
			) : (
				<Copy
					data-icon="inline-end"
					className="ml-1.5 size-3.5 text-muted-foreground"
				/>
			)}
		</Button>
	);
}
