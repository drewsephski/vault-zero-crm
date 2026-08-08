"use client";

import { PageShellDescription, PageShellTitle } from "@/components/page-shell";
import { useWorkspaceLabels } from "@/lib/use-workspace-labels";

export function WorkspaceSectionHeading({
	section,
}: {
	section: "companies" | "deals" | "tasks";
}) {
	const labels = useWorkspaceLabels();

	if (section === "companies") {
		return (
			<>
				<PageShellTitle>{labels.companies}</PageShellTitle>
				<PageShellDescription>
					Every {labels.companyLower} being tracked and researched.
				</PageShellDescription>
			</>
		);
	}

	if (section === "tasks") {
		return (
			<>
				<PageShellTitle>Tasks</PageShellTitle>
				<PageShellDescription>
					The next actions assigned to you, with their {labels.companyLower} and{" "}
					{labels.dealLower} context.
				</PageShellDescription>
			</>
		);
	}

	return (
		<>
			<PageShellTitle>{labels.deals}</PageShellTitle>
			<PageShellDescription>
				Every active and completed {labels.dealLower}.
			</PageShellDescription>
		</>
	);
}
