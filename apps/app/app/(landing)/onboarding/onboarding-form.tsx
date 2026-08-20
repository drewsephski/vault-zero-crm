"use client";

import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@crm/ui/components/input-group";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { workspaceUrl } from "@/lib/workspace-url";

export function OnboardingForm({ placeholder }: { placeholder: string }) {
	const trpc = useTRPC();
	const router = useRouter();

	const nameId = useId();
	const websiteId = useId();

	const save = useMutation(
		trpc.workspace.update.mutationOptions({
			onSuccess: (workspace) => {
				router.refresh();
				router.replace(workspaceUrl(workspace.slug));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();

				const form = new FormData(event.currentTarget);

				save.mutate({
					name: String(form.get("name") ?? "").trim(),
					website: String(form.get("website") ?? "").trim() || null,
				});
			}}
			className="flex flex-col gap-6"
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={nameId}>Workspace name</FieldLabel>
					<Input
						id={nameId}
						name="name"
						placeholder={placeholder}
						autoComplete="organization"
						autoFocus
						required
					/>
				</Field>

				<Field>
					<FieldLabel htmlFor={websiteId}>
						Your company website (optional)
					</FieldLabel>
					<InputGroup>
						<InputGroupAddon>
							<InputGroupText>https://</InputGroupText>
						</InputGroupAddon>
						<InputGroupInput
							id={websiteId}
							name="website"
							placeholder="acme.com"
							autoComplete="off"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							inputMode="url"
						/>
					</InputGroup>
					<FieldDescription>
						If provided, Eve uses this context when researching and comparing
						acquisition targets.
					</FieldDescription>
				</Field>
			</FieldGroup>

			<Button type="submit" disabled={save.isPending}>
				{save.isPending ? <Spinner data-icon="inline-start" /> : null}
				Continue
			</Button>
		</form>
	);
}
