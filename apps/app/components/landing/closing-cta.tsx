import { Button } from "@crm/ui/components/button";
import Link from "next/link";

export function ClosingCta() {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center gap-8 px-6 py-10">
			<div className="relative flex w-[970px] max-w-full shrink-0 flex-col items-center justify-center gap-7 bg-background px-6 py-[72px] md:h-[482px] md:px-12">
				<h2 className="text-balance text-center font-semibold text-4xl/[42px] tracking-tight md:text-[44px]/[50px]">
					Give every target a fair, evidence-backed look.
				</h2>

				<div className="flex flex-wrap items-center justify-center gap-3">
					<Button size="xl" asChild>
						<Link href="/sign-in">Start sourcing</Link>
					</Button>
				</div>

				<p className="text-center text-muted-foreground text-xs/5">
					Your buy box guides discovery, research, qualification, and follow-up.
				</p>
			</div>
		</section>
	);
}
