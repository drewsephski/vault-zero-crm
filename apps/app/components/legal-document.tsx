import Logo from "@crm/ui/components/logo";
import { Link } from "@crm/ui/components/link";
import type { ReactNode } from "react";

const COPYRIGHT_YEAR = 2026;

export function LegalDocument({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<div className="dark min-h-svh bg-background text-foreground">
			<header className="border-border border-b">
				<div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-6 px-6 py-6">
					<Link href="/" aria-label="Vault Zero CRM home" className="flex">
						<Logo className="size-6 shrink-0" />
					</Link>
					<nav className="flex items-center gap-4 text-sm">
						<Link href="/privacy">Privacy</Link>
						<Link href="/terms">Terms</Link>
						<Link href="/sign-in">Sign in</Link>
					</nav>
				</div>
			</header>

			<main className="mx-auto w-full max-w-3xl px-6 py-12">
				<div className="flex flex-col gap-3">
					<p className="font-mono text-muted-foreground text-xs uppercase">
						Vault Zero CRM
					</p>
					<h1 className="text-3xl font-semibold tracking-tight text-balance">
						{title}
					</h1>
					<p className="max-w-prose text-muted-foreground text-sm text-pretty">
						{description}
					</p>
				</div>

				<article className="mt-10 flex flex-col gap-8 text-sm leading-6 text-foreground">
					{children}
				</article>
			</main>

			<footer className="border-border border-t">
				<div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-6 text-muted-foreground text-sm">
					<p>© {COPYRIGHT_YEAR} Vault Zero</p>
					<Link href="/privacy">Privacy</Link>
					<Link href="/terms">Terms</Link>
					<Link
						href="https://www.vaultzero.dev"
						target="_blank"
						rel="noopener noreferrer"
					>
						vaultzero.dev
					</Link>
				</div>
			</footer>
		</div>
	);
}

export function LegalSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-base font-semibold tracking-tight">{title}</h2>
			<div className="flex flex-col gap-3 text-muted-foreground">{children}</div>
		</section>
	);
}
