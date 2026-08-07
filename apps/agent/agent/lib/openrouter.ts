import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
	appName: "Vault Zero CRM",
	appUrl: "https://github.com/trycompai/crm",
	compatibility: "strict",
});

export function openRouterModel(id: string): LanguageModel {
	return openrouter.chat(id, {
		provider: { require_parameters: true },
	});
}
