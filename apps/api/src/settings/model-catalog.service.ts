import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";

const CATALOG_URL = "https://openrouter.ai/api/v1/models";

const CATALOG_TTL_MS = 30 * 60_000;

const CATALOG_KEY = "settings:model-catalog";

const CATALOG_TIMEOUT_MS = 5_000;

export interface CatalogModel {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
}

interface OpenRouterModel {
	id?: unknown;
	name?: unknown;
	context_length?: unknown;
	supported_parameters?: unknown;
	pricing?: { prompt?: unknown; completion?: unknown } | null;
}

function rate(value: unknown): number | null {
	const parsed = typeof value === "string" ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function usable(model: OpenRouterModel): boolean {
	const parameters = Array.isArray(model.supported_parameters)
		? model.supported_parameters
		: [];
	return (
		typeof model.id === "string" &&
		parameters.includes("tools") &&
		typeof model.context_length === "number" &&
		model.context_length > 0
	);
}

function providerName(id: string, name: unknown): string {
	if (typeof name === "string") {
		const separator = name.indexOf(":");
		if (separator > 0) return name.slice(0, separator);
	}

	return id.split("/")[0] ?? id;
}

@Injectable()
export class ModelCatalogService {
	private readonly logger = new Logger(ModelCatalogService.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	async models(): Promise<CatalogModel[] | null> {
		const cached = await this.cache.get<CatalogModel[]>(CATALOG_KEY);
		if (cached) return cached;

		const models = await this.fetchCatalog();
		if (!models) return null;

		await this.cache.set(CATALOG_KEY, models, CATALOG_TTL_MS);
		return models;
	}

	async find(id: string): Promise<CatalogModel | null> {
		const models = await this.models();
		return models?.find((model) => model.id === id) ?? null;
	}

	private async fetchCatalog(): Promise<CatalogModel[] | null> {
		try {
			const response = await fetch(CATALOG_URL, {
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
			});

			if (!response.ok) {
				this.logger.warn({
					message: "Model catalog request failed",
					status: response.status,
				});
				return null;
			}

			const body = (await response.json()) as { data?: unknown };
			const rows = Array.isArray(body.data)
				? (body.data as OpenRouterModel[])
				: [];

			const models = rows.filter(usable).map((model): CatalogModel => {
				const id = model.id as string;
				const input = rate(model.pricing?.prompt);
				const output = rate(model.pricing?.completion);

				return {
					id,
					name: typeof model.name === "string" && model.name ? model.name : id,
					provider: providerName(id, model.name),
					contextWindowTokens: model.context_length as number,
					pricing: input !== null && output !== null ? { input, output } : null,
				};
			});

			models.sort(
				(a, b) =>
					a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
			);

			this.logger.log({
				message: "Model catalog loaded",
				models: models.length,
			});

			return models;
		} catch (error) {
			this.logger.warn({
				message: "Model catalog unavailable",
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}
}
