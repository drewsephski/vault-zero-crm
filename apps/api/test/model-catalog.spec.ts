import { afterEach, describe, expect, it } from "bun:test";
import type { Cache } from "cache-manager";
import { ModelCatalogService } from "../src/settings/model-catalog.service";

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function service() {
	let value: unknown;
	const cache = {
		get: async () => value,
		set: async (_key: string, next: unknown) => {
			value = next;
		},
	} as unknown as Cache;

	return new ModelCatalogService(cache);
}

describe("OpenRouter model catalog", () => {
	it("keeps tool-capable models and converts token prices", async () => {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					data: [
						{
							id: "nvidia/free-model:free",
							name: "NVIDIA: Free Model",
							context_length: 1_000_000,
							supported_parameters: ["tools", "temperature"],
							pricing: { prompt: "0", completion: "0" },
						},
						{
							id: "vendor/text-only",
							name: "Vendor: Text Only",
							context_length: 32_000,
							supported_parameters: ["temperature"],
							pricing: { prompt: "0.000001", completion: "0.000002" },
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			)) as unknown as typeof fetch;

		expect(await service().models()).toEqual([
			{
				id: "nvidia/free-model:free",
				name: "NVIDIA: Free Model",
				provider: "NVIDIA",
				contextWindowTokens: 1_000_000,
				pricing: { input: 0, output: 0 },
			},
		]);
	});

	it("returns null when OpenRouter is unavailable", async () => {
		globalThis.fetch = (async () =>
			new Response(null, { status: 503 })) as unknown as typeof fetch;
		expect(await service().models()).toBeNull();
	});
});
