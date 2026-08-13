import { DEFAULT_WORKSPACE_NAME } from "@crm/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireGoogleAccess } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { workspaceUrl } from "@/lib/workspace-url";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
	title: "Set up",
};

export const instant = false;

export default async function OnboardingPage() {
	await requireGoogleAccess();

	const workspace = await getServerQueryClient()
		.fetchQuery(getServerTrpc().workspace.get.queryOptions())
		.catch(() => null);

	if (workspace && (workspace.onboarded || !workspace.canRename)) {
		redirect(workspaceUrl(workspace.slug));
	}

	return (
		<AuthShell>
			<AuthHeading
				title="Set up your acquisition workspace"
				description="Tell Eve who is running the search. You will define the businesses you want to acquire next."
			/>

			<OnboardingForm placeholder={DEFAULT_WORKSPACE_NAME} />
		</AuthShell>
	);
}
