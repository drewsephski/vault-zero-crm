import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { EmailPasswordAuth } from "./email-password-auth";
import { GoogleSignIn } from "./google-sign-in";
import { MicrosoftSignIn } from "./microsoft-sign-in";
import { type SsoProvider, SsoSignIn } from "./sso-sign-in";

export const metadata: Metadata = {
	title: "Sign in",
};

type SignInOptions = { google: boolean; microsoft: boolean; providers: SsoProvider[] };

async function signInOptions(): Promise<SignInOptions | null> {
	try {
		return await getServerQueryClient().fetchQuery(
			getServerTrpc().sso.signInOptions.queryOptions(),
		);
	} catch (error) {
		unstable_rethrow(error);
		console.error("Sign-in: could not read the sign-in options.", error);
		return null;
	}
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
	return (
		<AuthShell>
			<Suspense
				fallback={
					<AuthHeading
						title="Welcome back"
						description="Sign in with your account to continue."
					/>
				}
			>
				<SignIn searchParams={searchParams} />
			</Suspense>
		</AuthShell>
	);
}

async function SignIn({
	searchParams,
}: Pick<PageProps<"/sign-in">, "searchParams">) {
	const [session, options, { method }] = await Promise.all([
		getSession().catch((error: unknown) => {
			unstable_rethrow(error);
			console.error("Sign-in: could not read the session.", error);
			return null;
		}),
		signInOptions(),
		searchParams,
	]);

	if (session) {
		redirect("/");
	}

	const google = options?.google ?? true;
	const microsoft = options?.microsoft ?? true;
	const providers = options?.providers ?? [];

	const insistOnGoogle = method === "google" && google;
	const insistOnMicrosoft = method === "microsoft" && microsoft;
	const showSso =
		providers.length > 0 && !insistOnGoogle && !insistOnMicrosoft;
	const showGoogle = google && (providers.length === 0 || insistOnGoogle);
	const showMicrosoft =
		microsoft && (providers.length === 0 || insistOnMicrosoft);
	const showEmailPassword = true;
	const showOnlyEmailPassword =
		showEmailPassword && !showSso && !showGoogle && !showMicrosoft;

	return (
		<>
			<AuthHeading
				title="Welcome back"
				description="Sign in with your account to continue."
			/>
			{showOnlyEmailPassword ? (
				<p className="text-sm text-muted-foreground">
					This install currently has no Google, Microsoft, or identity-provider sign-in configured.
				</p>
			) : null}
			<EmailPasswordAuth />

			{showSso ? <SsoSignIn providers={providers} /> : null}
			{showGoogle ? <GoogleSignIn /> : null}
			{showMicrosoft ? <MicrosoftSignIn /> : null}
		</>
	);
}
