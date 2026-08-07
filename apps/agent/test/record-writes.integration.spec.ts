import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import {
	createCompany,
	createContact,
	updateCompany,
	updateContact,
	updateDeal,
} from "../agent/lib/record-writes";

const suffix = process.env.TEST_RUN_ID ?? "record-writes-spec";
const domain = `agent-writes-${suffix}.test`;
const updatedDomain = `agent-writes-updated-${suffix}.test`;
const createdDomain = `created-${suffix}.test`;
const email = `agent-writes-${suffix}@example.test`;
const createdContactEmail = `created-contact-${suffix}@example.test`;
const suppressedEmail = `agent-suppressed-${suffix}@example.test`;

let userId: string;
let companyId: string;
let contactId: string;
let dealId: string;

beforeAll(async () => {
	await cleanup();

	const user = await db.user.create({
		data: {
			id: `agent-writes-user-${suffix}`,
			name: "Agent Writes",
			email: `agent-writes-user-${suffix}@example.test`,
			emailVerified: true,
		},
		select: { id: true },
	});
	userId = user.id;

	const company = await db.company.create({
		data: { name: `Agent Writes ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const contact = await db.contact.create({
		data: { firstName: "Agent", email, companyId },
		select: { id: true },
	});
	contactId = contact.id;

	const deal = await db.deal.create({
		data: {
			name: `Agent deal ${suffix}`,
			companyId,
			ownerId: userId,
			stage: DealStage.DEMO_BOOKED,
		},
		select: { id: true },
	});
	dealId = deal.id;
});

afterAll(cleanup);

async function cleanup(): Promise<void> {
	const companies = await db.company.findMany({
		where: { domain: { in: [domain, updatedDomain, createdDomain] } },
		select: { id: true },
	});
	const companyIds = companies.map((company) => company.id);

	if (companyIds.length > 0) {
		await db.agentTask.deleteMany({ where: { companyId: { in: companyIds } } });
		await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
		await db.contact.deleteMany({ where: { companyId: { in: companyIds } } });
		await db.company.deleteMany({ where: { id: { in: companyIds } } });
	}

	const standaloneContacts = await db.contact.findMany({
		where: { email: { in: [email, createdContactEmail] } },
		select: { id: true },
	});
	if (standaloneContacts.length > 0) {
		await db.agentTask.deleteMany({
			where: {
				contactId: { in: standaloneContacts.map((contact) => contact.id) },
			},
		});
		await db.contact.deleteMany({
			where: { id: { in: standaloneContacts.map((contact) => contact.id) } },
		});
	}
	await db.suppressedContact.deleteMany({
		where: { email: { in: [email, createdContactEmail, suppressedEmail] } },
	});
	await db.user.deleteMany({
		where: { email: `agent-writes-user-${suffix}@example.test` },
	});
}

describe("record writes", () => {
	it("creates a company and queues its enrichment work", async () => {
		const company = await createCompany({
			name: `Created Agent Writes ${suffix}`,
			domain: createdDomain,
		});

		const tasks = await db.agentTask.findMany({
			where: { companyId: company.id },
			select: { kind: true },
		});

		expect(tasks.map((task) => task.kind).sort()).toEqual([
			"brand",
			"company-profile",
		]);

		await db.agentTask.deleteMany({ where: { companyId: company.id } });
		await db.company.delete({ where: { id: company.id } });
	});

	it("creates a contact with profile identity reserved for the evidence ledger", async () => {
		const contact = await createContact({
			firstName: "Created",
			lastName: "Contact",
			email: createdContactEmail,
			profileUrl: "created-contact",
		});

		const row = await db.contact.findUnique({
			where: { id: contact.id },
			select: { firstName: true, email: true, title: true, linkedinUrl: true },
		});
		const tasks = await db.agentTask.findMany({
			where: { contactId: contact.id },
			select: { kind: true, priority: true, budget: true },
		});

		expect(contact.profileUrl).toBe(
			"https://www.linkedin.com/in/created-contact",
		);
		expect(row).toMatchObject({
			firstName: "Created",
			email: createdContactEmail,
			title: null,
			linkedinUrl: null,
		});
		expect(tasks).toEqual([{ kind: "identify", priority: 100, budget: 4 }]);

		await db.agentTask.deleteMany({ where: { contactId: contact.id } });
		await db.contact.delete({ where: { id: contact.id } });
	});

	it("resets company enrichment and queues work when its domain changes", async () => {
		await db.agentTask.deleteMany({ where: { companyId } });

		await updateCompany(companyId, { domain: updatedDomain });

		const company = await db.company.findUnique({
			where: { id: companyId },
			select: { domain: true, enrichmentStatus: true },
		});
		const tasks = await db.agentTask.findMany({
			where: { companyId },
			select: { kind: true },
		});

		expect(company).toMatchObject({
			domain: updatedDomain,
			enrichmentStatus: "PENDING",
		});
		expect(tasks).toHaveLength(2);

		await db.agentTask.deleteMany({ where: { companyId } });
		await updateCompany(companyId, { domain });
	});

	it("updates contact fields without deleting unrelated suppressions", async () => {
		await db.suppressedContact.create({ data: { email: suppressedEmail } });

		await updateContact(contactId, {
			title: "Head of Operations",
			email: "Agent.Writes@Example.test",
		});

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { title: true, email: true },
		});
		const suppression = await db.suppressedContact.findUnique({
			where: { email: suppressedEmail },
		});

		expect(contact).toMatchObject({
			title: "Head of Operations",
			email: "agent.writes@example.test",
		});
		expect(suppression?.email).toBe(suppressedEmail);
	});

	it("updates deal metadata without changing its amount contract", async () => {
		await updateDeal(dealId, {
			name: `Updated agent deal ${suffix}`,
			description: "Updated by the rep through the agent.",
			expectedCloseDate: "2026-12-15T00:00:00.000Z",
		});

		const deal = await db.deal.findUnique({
			where: { id: dealId },
			select: { name: true, description: true, expectedCloseDate: true },
		});

		expect(deal?.name).toBe(`Updated agent deal ${suffix}`);
		expect(deal?.description).toBe("Updated by the rep through the agent.");
		expect(deal?.expectedCloseDate?.toISOString()).toBe(
			"2026-12-15T00:00:00.000Z",
		);
	});
});
