"use client";

import { signIn, signUp } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

type AuthMode = "signIn" | "signUp";

export function EmailPasswordAuth() {
	const [mode, setMode] = useState<AuthMode>("signIn");
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);

		const form = new FormData(event.currentTarget);
		const name = String(form.get("name") ?? "").trim();
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");

		const origin = window.location.origin;
		const redirectOptions = {
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/sign-in`,
		};

		let error: { message?: string } | null = null;

		if (mode === "signUp" && password.length < 8) {
			toast.error("Use a password of at least 8 characters.");
			setPending(false);
			return;
		}

		if (mode === "signIn") {
			({ error } = await signIn.email({ email, password, ...redirectOptions }));
		} else {
			({ error } = await signUp.email({
				name,
				email,
				password,
				...redirectOptions,
			}));
		}

		if (error) {
			toast.error(error.message ?? "Could not complete email authentication.");
			setPending(false);
			return;
		}

		window.location.assign("/");
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				<Button
					type="button"
					variant={mode === "signIn" ? "default" : "outline"}
					onClick={() => setMode("signIn")}
					disabled={pending}
					aria-pressed={mode === "signIn"}
				>
					Sign in
				</Button>
				<Button
					type="button"
					variant={mode === "signUp" ? "default" : "outline"}
					onClick={() => setMode("signUp")}
					disabled={pending}
					aria-pressed={mode === "signUp"}
				>
					Create account
				</Button>
			</div>

			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				<FieldGroup>
					{mode === "signUp" ? (
						<Field>
							<FieldLabel htmlFor="auth-name">Full name</FieldLabel>
							<Input
								id="auth-name"
								name="name"
								autoComplete="name"
								autoFocus={mode === "signUp"}
								required
							/>
						</Field>
					) : null}

					<Field>
						<FieldLabel htmlFor="auth-email">Email</FieldLabel>
						<Input
							id="auth-email"
							name="email"
							type="email"
							autoComplete="email"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							required
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor="auth-password">Password</FieldLabel>
						<Input
							id="auth-password"
							name="password"
							type="password"
							autoComplete={
								mode === "signIn" ? "current-password" : "new-password"
							}
							minLength={8}
							required
						/>
						{mode === "signUp" ? (
							<FieldDescription>At least 8 characters.</FieldDescription>
						) : null}
					</Field>
				</FieldGroup>

				<Button type="submit" disabled={pending}>
					{pending ? <Spinner data-icon="inline-start" /> : null}
					{mode === "signIn" ? "Sign in with email" : "Create account"}
				</Button>
			</form>
		</div>
	);
}
