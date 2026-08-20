import "@crm/env/load";

import { db } from "@crm/db";
import { readContextDevKey } from "@crm/db/settings";
import { getOrganizationId } from "@crm/db/tenancy";

export const CONTEXT_DEV = "CONTEXT_DEV";
export const ANYSEARCH = "ANYSEARCH_API_KEY";
export const CRM = "CRM";

export type Capability = {
	readonly id: string;
	readonly label: string;
	readonly gives: string;
	readonly enabled: boolean;
	readonly from: string;
};

export async function contextDevKey(): Promise<string | null> {
	try {
		return await readContextDevKey(db);
	} catch (error) {
		console.error(
			`[agent] could not read the Context.dev key from the database: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);

		return null;
	}
}

export async function capabilities(): Promise<readonly Capability[]> {
	const [contextDev, crm] = await Promise.all([contextDevKey(), crmReady()]);
	return capabilitiesFrom(contextDev, crm);
}

export function capabilitiesFrom(
	contextDev: string | null,
	crm = true,
): readonly Capability[] {
	const fromEnv = (id: string) => ({
		id,
		from: id,
		enabled: Boolean(process.env[id]?.trim()),
	});

	return [
		{
			id: CRM,
			from: "CRM database",
			label: "CRM records",
			gives:
				"read and update the contacts, companies and deals already in this CRM",
			enabled: crm,
		},
		{
			...fromEnv("TAVILY_API_KEY"),
			label: "Web research",
			gives:
				"open-web context with citations, and the search that finds a LinkedIn slug in the first place",
		},
		{
			...fromEnv(ANYSEARCH),
			label: "AnySearch",
			gives:
				"general and vertical search results with compact source content for research and candidate discovery",
		},
		{
			id: CONTEXT_DEV,
			from: "Settings → General",
			label: "Company brand data",
			gives: "a company's logo, industry, location and socials from its domain",
			enabled: contextDev !== null,
		},
		{
			...fromEnv("BLOB_READ_WRITE_TOKEN"),
			label: "Picture storage",
			gives:
				"somewhere to keep a logo or a profile photo. Without it a record has no picture at all, because the URLs these sources hand back expire and are never stored as they are",
		},
	];
}

async function crmReady(): Promise<boolean> {
	try {
		if (getOrganizationId()) {
			await db.contact.findFirst({ select: { id: true } });
		} else {
			await db.$queryRaw`SELECT 1`;
		}
		return true;
	} catch {
		return false;
	}
}

export async function enabled(id: string): Promise<boolean> {
	return (await capabilities()).some(
		(capability) => capability.id === id && capability.enabled,
	);
}

export function unavailable(env: string): {
	ok: false;
	configured: false;
	reason: string;
} {
	return {
		ok: false,
		configured: false,
		reason:
			`This install has no ${env}, so that source is unavailable. This is not a failure and retrying will not help — ` +
			"use what the CRM already knows, and say in your write-up what you could not check.",
	};
}

export function unavailableCapability(label: string): {
	ok: false;
	configured: true;
	reason: string;
} {
	return {
		ok: false,
		configured: true,
		reason: `The ${label} is not reachable right now. No record was changed. Try again when it is available.`,
	};
}

export async function logCapabilities(): Promise<void> {
	for (const capability of await capabilities()) {
		console.log(
			`[agent] ${capability.enabled ? "on " : "off"}  ${capability.label} (${capability.from})`,
		);
	}
}

export async function capabilitiesMarkdown(): Promise<string> {
	return markdownFor(await capabilities());
}

export function markdownFor(all: readonly Capability[]): string {
	const core = all.filter((capability) => capability.id === CRM);
	const on = all.filter(
		(capability) => capability.id !== CRM && capability.enabled,
	);
	const off = all.filter(
		(capability) => capability.id !== CRM && !capability.enabled,
	);

	const lines = ["## What you can use here", ""];

	for (const capability of core) {
		lines.push(
			`${capability.enabled ? "The CRM is available" : "The CRM is unavailable"}: ${capability.gives}.`,
		);
	}

	if (on.length === 0) {
		lines.push(
			"No outside sources are configured on this install. Everything you can",
			"learn is already in the CRM — email threads, meetings, signature",
			"blocks — and `read_crm_history` reads all of it for free. That is",
			"often enough to settle who somebody is. Record what it shows, and",
			"leave the rest empty.",
		);
		return lines.join("\n");
	}

	lines.push("Available:");
	for (const capability of on) {
		lines.push(`- **${capability.label}** — ${capability.gives}.`);
	}

	if (off.length > 0) {
		lines.push("", "Not configured here, so do not plan around them:");
		for (const capability of off) {
			lines.push(`- ${capability.label}`);
		}
		lines.push(
			"",
			"Their tools will tell you the same thing if you call them. Note what",
			"you could not check rather than guessing at it.",
		);
	}

	return lines.join("\n");
}
