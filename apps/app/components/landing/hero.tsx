import { Button } from "@crm/ui/components/button";
import Link from "next/link";

export function Hero() {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20 pb-10 md:pt-30">
			<div className="relative flex w-full max-w-6xl flex-col items-center gap-7">
				<h1 className="max-w-[760px] text-balance text-center font-semibold text-5xl/[52px] tracking-tight md:text-[72px]/[76px]">
					Find the businesses worth buying.
				</h1>

				<p className="max-w-[640px] text-pretty text-center text-muted-foreground text-lg/[28px] md:text-xl/[30px]">
					Vault Zero CRM is an AI acquisition CRM that continuously discovers,
					researches, and qualifies businesses against your buy box—so you can
					focus on judgment, outreach, and closing.
				</p>

				<div className="flex flex-wrap items-center justify-center gap-3 pt-3">
					<Button size="xl" asChild>
						<Link href="/sign-in">Open Vault Zero CRM</Link>
					</Button>
				</div>

				<p className="text-center text-muted-foreground text-xs/5">
					Evidence-backed research. Durable work. Human decisions.
				</p>
			</div>
		</section>
	);
}
