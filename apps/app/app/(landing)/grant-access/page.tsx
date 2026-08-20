import { needsGoogleGrant } from "@crm/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireSession, signInAccounts } from "@/lib/session";
import { GrantAccess } from "./grant-access";

export const metadata: Metadata = {
	title: "Grant access",
};

export const instant = false;

export default async function GrantAccessPage() {
	const { user } = await requireSession();

	if (!needsGoogleGrant(await signInAccounts(user.id))) {
		redirect("/");
	}

	return (
		<AuthShell>
			<AuthHeading
				title="One more step"
				description="This CRM reads Gmail and Calendar to match activity to companies. It can send a Gmail message only after you review and approve its exact recipients, subject, and body."
			/>

			<GrantAccess />

			<p className="text-center text-muted-foreground text-sm/5">
				Only conversations with companies in the CRM are stored. Personal mail
				is discarded without being saved.
			</p>
		</AuthShell>
	);
}
