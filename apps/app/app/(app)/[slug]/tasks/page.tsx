import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
} from "@/components/page-shell";
import { WorkspaceSectionHeading } from "@/components/workspace-section-heading";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { TasksTable } from "./tasks-table";

export const metadata: Metadata = {
	title: "Tasks",
};

export default function TasksPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<WorkspaceSectionHeading section="tasks" />
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<TaskSurface />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function TaskSurface() {
	await requireSession();

	return (
		<HydrateClient>
			<TasksTable />
		</HydrateClient>
	);
}
