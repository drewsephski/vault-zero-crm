import { describe, expect, it } from "bun:test";
import { APP_AUTH } from "../agent/lib/app-auth";
import { isAutomated } from "../agent/lib/approval";
import {
	brief,
	dispatchReceipt,
	requestQueueRefill,
	researchSlots,
	taskAuth,
} from "../agent/lib/dispatch";
import { collapsing } from "../agent/lib/pool";
import type { LeasedTask } from "../agent/lib/tasks";
import {
	companyProfileCompletion,
	companyProfileRequester,
} from "../agent/lib/tasks";

function deferred() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

describe("collapsing", () => {
	it("a burst of pokes is one drain and one catch-up, not one drain each", async () => {
		const gate = deferred();
		let runs = 0;

		const drain = collapsing(async () => {
			runs += 1;
			await gate.promise;
		});

		const all = [drain(), drain(), drain(), drain()];
		expect(runs).toBe(1);

		gate.release();
		await Promise.all(all);

		expect(runs).toBe(2);
	});

	it("work queued mid-drain gets a trailing run rather than waiting for the cron", async () => {
		const first = deferred();
		const second = deferred();
		const gates = [first, second];
		let runs = 0;

		const drain = collapsing(async () => {
			const gate = gates[runs];
			runs += 1;
			await gate?.promise;
		});

		const initial = drain();
		const during = drain();

		first.release();
		second.release();
		await Promise.all([initial, during]);

		expect(runs).toBe(2);
	});

	it("a failed drain does not wedge the next one", async () => {
		let runs = 0;

		const drain = collapsing(async () => {
			runs += 1;
			throw new Error("lane blew up");
		});

		await expect(drain()).rejects.toThrow("lane blew up");
		await expect(drain()).rejects.toThrow("lane blew up");

		expect(runs).toBe(2);
	});

	it("hands the trailing run the arguments of the poke that asked for it", async () => {
		const gate = deferred();
		const seen: string[] = [];

		const drain = collapsing(async (label: string) => {
			seen.push(label);
			if (seen.length === 1) await gate.promise;
		});

		const first = drain("cron");
		const second = drain("poke");

		gate.release();
		await Promise.all([first, second]);

		expect(seen).toEqual(["cron", "poke"]);
	});
});

function task(overrides: Partial<LeasedTask> = {}): LeasedTask {
	return {
		id: "task_1",
		contactId: "contact_1",
		companyId: null,
		kind: "identify",
		reason: "A new contact",
		budget: 4,
		attempts: 1,
		priority: 100,
		dueAt: new Date(),
		...overrides,
	};
}

describe("taskAuth", () => {
	it("reads as the app principal, so an unattended turn is not asked to approve itself", () => {
		const auth = taskAuth(task());

		expect(isAutomated({ auth: { current: auth } })).toBe(true);
	});

	it("carries the record context", () => {
		const auth = taskAuth(
			task({ companyId: "company_1", requestedById: "user_1" }),
		);

		expect(auth.attributes).toMatchObject({
			taskKind: "identify",
			contactId: "contact_1",
			companyId: "company_1",
			requestedById: "user_1",
		});
		expect(auth.attributes).not.toHaveProperty("budget");
	});

	it("omits the id of a record the task does not name", () => {
		const auth = taskAuth(task({ contactId: null, companyId: "company_1" }));

		expect(auth.attributes).not.toHaveProperty("contactId");
	});

	it("prefers the principal eve hands the schedule over our own copy", () => {
		const fromEve = { ...APP_AUTH, principalId: "eve:app", issuer: "eve" };
		const auth = taskAuth(task(), fromEve);

		expect(auth).toMatchObject({ issuer: "eve" });
		expect(isAutomated({ auth: { current: auth } })).toBe(true);
	});
});

describe("company profile dispatch", () => {
	it("uses the requester recorded on the active durable task", async () => {
		const requester = await companyProfileRequester(
			"company_1",
			async () => "user_1",
		);

		expect(requester).toBe("user_1");
	});

	it("requires a durable brief even when website extraction is unavailable", () => {
		const instruction = brief(
			task({
				contactId: null,
				companyId: "company_1",
				kind: "company-profile",
			}),
		);

		expect(instruction).toContain("write_company_brief");
		expect(instruction).toContain("does not complete");
	});

	it("rejects a parked session that did not persist a brief", async () => {
		const result = await companyProfileCompletion("task_1", async () => ({
			kind: "company-profile",
			briefs: 0,
		}));

		expect(result).toEqual({
			ok: false,
			reason: "Research finished without saving a company brief.",
		});
	});

	it("accepts a company profile only after a brief is persisted", async () => {
		const result = await companyProfileCompletion("task_1", async () => ({
			kind: "company-profile",
			briefs: 1,
		}));

		expect(result).toEqual({ ok: true });
	});
});

describe("dispatchReceipt", () => {
	it("confirms a task that the drain claimed", async () => {
		const receipt = await dispatchReceipt("task_1", async () => ({
			attempts: 1,
			finishedAt: null,
		}));

		expect(receipt).toEqual({ taskId: "task_1", state: "claimed" });
	});

	it("keeps an untouched task visibly queued", async () => {
		const receipt = await dispatchReceipt("task_1", async () => ({
			attempts: 0,
			finishedAt: null,
		}));

		expect(receipt).toEqual({ taskId: "task_1", state: "queued" });
	});
});

describe("researchSlots", () => {
	it("fills only the unused global research capacity", () => {
		expect(researchSlots(0)).toBe(12);
		expect(researchSlots(7)).toBe(5);
		expect(researchSlots(12)).toBe(0);
		expect(researchSlots(20)).toBe(0);
	});
});

describe("requestQueueRefill", () => {
	it("asks the authenticated agent route to fill newly available capacity", async () => {
		const requests: Array<{ input: string; authorization: string | null }> = [];
		const fetcher = async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			requests.push({
				input: String(input),
				authorization: new Headers(init?.headers).get("authorization"),
			});
			return new Response(null, { status: 200 });
		};

		await requestQueueRefill(
			"https://agent.example.com",
			"bridge-secret",
			fetcher as typeof fetch,
		);

		expect(requests).toEqual([
			{
				input: "https://agent.example.com/internal/crm/dispatch",
				authorization: "Bearer bridge-secret",
			},
		]);
	});
});
