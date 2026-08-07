import { db } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";
import { openRouterModel } from "./openrouter";

export interface ModelSelection {
	model: ReturnType<typeof openRouterModel>;
	modelContextWindowTokens: number;
}

export async function selectedModel(): Promise<ModelSelection | null> {
	try {
		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		return {
			model: openRouterModel(setting.id),
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}
