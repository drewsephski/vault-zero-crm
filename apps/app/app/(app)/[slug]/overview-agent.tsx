"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanel,
	CardTitle,
} from "@crm/ui/components/card";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { AgentChat } from "@/components/crm/agent-panel";
import {
	AGENT_THREAD_PARAM,
	agentThreadParser,
} from "@/components/crm/agent-search-params";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function OverviewAgent() {
	const workspaceUrl = useWorkspaceUrl();
	const [thread, setThread] = useQueryState(
		AGENT_THREAD_PARAM,
		agentThreadParser.withOptions({ history: "push" }),
	);

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Ask your CRM</CardTitle>
				<CardDescription>
					Find what needs attention across your contacts, companies, and deals.
				</CardDescription>
				<CardAction>
					<Button asChild variant="contrast" size="sm">
						<Link href={workspaceUrl("/agent")}>Open agent</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardPanel>
				<AgentChat
					density="compact"
					scope={{ kind: "workspace" }}
					thread={thread}
					onThreadChange={(next) => void setThread(next)}
				/>
			</CardPanel>
		</Card>
	);
}
