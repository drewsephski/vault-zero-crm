import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { workspaceUrl } from "@/lib/workspace-url";
import { Wordmark } from "./wordmark";

export function LandingNav() {
	return (
		<Suspense fallback={<LandingNavContent href="/sign-in" label="Sign in" />}>
			<ResolvedLandingNav />
		</Suspense>
	);
}

async function ResolvedLandingNav() {
	const navLink = await getNavLink();

	return <LandingNavContent {...navLink} />;
}

function LandingNavContent({ href, label }: { href: string; label: string }) {
	return (
		<header className="relative flex h-16 w-full shrink-0 items-center justify-center border-border border-b">
			<nav className="flex w-full max-w-6xl items-center justify-between gap-8 px-6">
				<Link href="/" aria-label="Homepage">
					<Wordmark />
				</Link>
				<Button variant="outline-ghost" asChild>
					<Link href={href}>{label}</Link>
				</Button>
			</nav>
		</header>
	);
}

async function getNavLink(): Promise<{ href: string; label: string }> {
	const session = await getSession();

	if (!session) return { href: "/sign-in", label: "Sign in" };

	const workspace = await getServerQueryClient()
		.fetchQuery(getServerTrpc().workspace.get.queryOptions())
		.catch(() => null);

	return workspace
		? { href: workspaceUrl(workspace.slug), label: "Dashboard" }
		: { href: "/onboarding", label: "Dashboard" };
}
