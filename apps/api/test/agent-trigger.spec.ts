import { describe, expect, it, mock } from "bun:test";
import {
	keepAgentDispatchAlive,
	requestAgentDispatch,
} from "../src/agent/agent-trigger.service";

const agent = {
	url: (path: string) => new URL(path, "https://agent.example.com"),
	secret: "test-bridge-secret",
};

describe("requestAgentDispatch", () => {
	it("waits for the agent to accept the dispatch", async () => {
		const requests: Array<{
			input: Parameters<typeof fetch>[0];
			init: Parameters<typeof fetch>[1];
		}> = [];
		const fetcher = mock(
			async (
				input: Parameters<typeof fetch>[0],
				init: Parameters<typeof fetch>[1],
			) => {
				requests.push({ input, init });
				return new Response(null, { status: 202 });
			},
		);

		await requestAgentDispatch(agent, fetcher as unknown as typeof fetch);

		expect(String(requests[0]?.input)).toBe(
			"https://agent.example.com/internal/crm/dispatch",
		);
		expect(requests[0]?.init?.method).toBe("POST");
		expect(requests[0]?.init?.headers).toEqual({
			authorization: "Bearer test-bridge-secret",
		});
		expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
	});

	it("rejects a dispatch the agent did not accept", async () => {
		const fetcher = mock(async () => new Response(null, { status: 401 }));

		expect(
			requestAgentDispatch(agent, fetcher as unknown as typeof fetch),
		).rejects.toThrow("Agent dispatch returned HTTP 401.");
	});
});

describe("keepAgentDispatchAlive", () => {
	it("registers the dispatch with the Vercel request lifecycle", () => {
		const dispatch = Promise.resolve();
		const defer = mock((_promise: Promise<unknown>) => {});

		keepAgentDispatchAlive(dispatch, { isVercel: true, defer });

		expect(defer).toHaveBeenCalledWith(dispatch);
	});

	it("does not require a lifecycle outside Vercel", () => {
		const defer = mock((_promise: Promise<unknown>) => {});

		keepAgentDispatchAlive(Promise.resolve(), {
			isVercel: false,
			defer,
		});

		expect(defer).not.toHaveBeenCalled();
	});
});
