import Logo from "@crm/ui/components/logo";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthShader } from "@/components/auth-shader";

export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<main className="dark grid min-h-svh bg-background text-foreground lg:grid-cols-2">
			<section className="relative hidden min-h-svh overflow-hidden bg-muted p-8 lg:flex lg:flex-col lg:justify-between xl:p-12">
				<AuthShader />

				<div className="relative flex gap-2 text-sm/5">
					<Link href="/" aria-label="Homepage" className="flex">
						<Logo className="size-5 shrink-0" />
					</Link>
				</div>

				<div className="relative mx-auto flex w-full max-w-lg flex-col gap-8 lg:my-auto">
					<div className="flex flex-col gap-4">
						<p className="font-mono text-xs/4 text-muted-foreground uppercase">
							Vault Zero CRM
						</p>
						<h1 className="max-w-[14ch] text-5xl/14 font-semibold text-balance">
							Find the businesses worth buying.
						</h1>
					</div>
				</div>

				<p className="relative mx-auto w-full max-w-lg font-mono text-xs/4 text-muted-foreground">
					Discover, research and qualify acquisition targets with Eve.
				</p>
			</section>

			<section className="flex min-h-svh flex-col bg-background px-6 py-8 sm:px-10 lg:px-12 xl:px-16">
				<div className="flex flex-1 items-center justify-center py-12">
					<div className="flex w-full max-w-lg flex-col gap-8">{children}</div>
				</div>
			</section>
		</main>
	);
}

export function AuthHeading({
	title,
	description,
}: {
	title: string;
	description: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 text-left">
			<Link href="/" aria-label="Homepage" className="flex">
				<Logo className="size-6 shrink-0" />
			</Link>
			<div className="flex flex-col gap-1">
				<h2 className="text-2xl/8 font-semibold tracking-tight text-balance">
					{title}
				</h2>
				<p className="max-w-[42ch] text-sm/5 text-muted-foreground text-pretty">
					{description}
				</p>
			</div>
		</div>
	);
}
