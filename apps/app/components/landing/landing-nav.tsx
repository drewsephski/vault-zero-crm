import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { Wordmark } from "./wordmark";

export function LandingNav() {
	return (
		<header className="relative flex h-16 w-full shrink-0 items-center justify-center border-border border-b">
			<nav className="flex w-full max-w-6xl items-center justify-between gap-8 px-6">
				<Link href="/" aria-label="Homepage">
					<Wordmark />
				</Link>
				<Button variant="outline-ghost" asChild>
					<Link href="/sign-in">Sign in</Link>
				</Button>
			</nav>
		</header>
	);
}
