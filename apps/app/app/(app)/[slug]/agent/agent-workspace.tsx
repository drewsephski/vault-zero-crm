"use client";

import { CardPanel } from "@crm/ui/components/card";
import { useQueryState } from "nuqs";
import { AgentChat } from "@/components/crm/agent-panel";
import {
	AGENT_THREAD_PARAM,
	agentThreadParser,
} from "@/components/crm/agent-search-params";

export function AgentWorkspace() {
	const [thread, setThread] = useQueryState(
		AGENT_THREAD_PARAM,
		agentThreadParser.withOptions({ history: "push" }),
	);

	return (
		<CardPanel size="fill">
			<AgentChat
				scope={{ kind: "workspace" }}
				thread={thread}
				onThreadChange={(next) => void setThread(next)}
			/>
		</CardPanel>
	);
}
