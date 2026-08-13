import { Link } from "@crm/ui/components/link";
import Logo from "@crm/ui/components/logo";
import { Wordmark } from "./wordmark";

export function LandingFooter() {
	return (
		<footer className="relative flex w-full shrink-0 flex-col items-center border-border border-t">
			<div className="flex w-full max-w-6xl flex-col items-start px-6 py-16">
				<div className="flex w-[280px] max-w-full shrink-0 flex-col gap-[14px]">
					<Wordmark />
					<p className="text-[13px]/[21px] text-muted-foreground">
						An AI-native acquisition CRM for finding and advancing businesses
						worth buying.
					</p>
				</div>
			</div>

			<div className="flex w-full justify-center border-border border-t">
				<div className="flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 md:h-[60px] md:py-0">
					<p className="flex flex-1 items-center gap-[5px] pt-[2px] text-[13px]/[21px] text-muted-foreground">
						Built with love by
						<Logo className="size-[13px] shrink-0 text-foreground" />
						<Link
							href="https://www.vaultzero.dev?utm_source=crm_landing_footer&utm_medium=referral"
							target="_blank"
							className="font-medium text-foreground"
						>
							Vault Zero
						</Link>
					</p>

					<p className="flex items-center gap-2 text-[13px]/5 text-muted-foreground">
						<span className="size-1.5 shrink-0 rounded-full bg-ring" />
						All systems normal
					</p>
				</div>
			</div>
		</footer>
	);
}
