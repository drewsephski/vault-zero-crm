import { db, Prisma } from "@crm/db";
import { slugFromLinkedinInput } from "./linkdapi";

export type CompanyUpdate = {
	name?: string;
	domain?: string | null;
	website?: string | null;
	description?: string | null;
	industry?: string | null;
	city?: string | null;
	stateCode?: string | null;
	country?: string | null;
	phone?: string | null;
	email?: string | null;
	linkedinUrl?: string | null;
};

export type ContactUpdate = {
	firstName?: string;
	lastName?: string | null;
	email?: string | null;
	phone?: string | null;
	title?: string | null;
	linkedinUrl?: string | null;
	twitterUrl?: string | null;
	githubUrl?: string | null;
	companyId?: string | null;
};

export type ContactCreate = {
	firstName: string;
	lastName?: string | null;
	email?: string | null;
	phone?: string | null;
	title?: string | null;
	linkedinUrl?: string | null;
	companyId?: string | null;
	ownerId?: string | null;
};

export type DealUpdate = {
	name?: string;
	description?: string | null;
	expectedCloseDate?: string | null;
	companyId?: string;
};

export function normalizeDomain(
	input: string | null | undefined,
): string | null {
	const trimmed = input?.trim().toLowerCase();
	if (!trimmed) return null;

	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let host: string;
	try {
		host = new URL(withScheme).hostname;
	} catch {
		return null;
	}

	const domain = host.replace(/^www\./, "");
	return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

export async function createCompany(input: {
	name: string;
	domain?: string;
}): Promise<{ id: string; name: string; domain: string | null }> {
	const name = input.name.trim();
	const domain = normalizeDomain(input.domain);

	if (!name) throw new Error("A company needs a name.");
	if (input.domain?.trim() && !domain) {
		throw new Error(
			`"${input.domain}" is not a domain — try something like "stripe.com".`,
		);
	}

	const existing = domain
		? await db.company.findUnique({
				where: { domain },
				select: { id: true, name: true, domain: true },
			})
		: await db.company.findFirst({
				where: { name: { equals: name, mode: "insensitive" } },
				select: { id: true, name: true, domain: true },
			});

	if (existing) {
		throw new Error(
			`${existing.name} already exists${existing.domain ? ` at ${existing.domain}` : ""}.`,
		);
	}

	return db.$transaction(async (tx) => {
		const company = await tx.company.create({
			data: {
				name,
				domain,
				website: domain ? `https://${domain}` : null,
			},
			select: { id: true, name: true, domain: true },
		});

		await enqueueCompanyTasks(tx, company.id, "Created by the agent");

		return company;
	});
}

export async function createContact(input: ContactCreate): Promise<{
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	linkedinUrl: string | null;
}> {
	const firstName = input.firstName.trim();
	const lastName = nullable(input.lastName);
	const email = normalizeEmail(input.email);
	const linkedinSlug = input.linkedinUrl
		? slugFromLinkedinInput(input.linkedinUrl)
		: null;
	if (input.linkedinUrl && !linkedinSlug) {
		throw new Error("That is not a LinkedIn profile URL or username.");
	}
	const linkedinUrl = linkedinSlug
		? `https://www.linkedin.com/in/${linkedinSlug}`
		: null;

	if (!firstName) throw new Error("A contact needs a first name.");

	const existing = await db.contact.findFirst({
		where: {
			OR: [
				...(email
					? [{ email: { equals: email, mode: "insensitive" as const } }]
					: []),
				...(linkedinUrl ? [{ linkedinUrl }] : []),
			],
		},
		select: { id: true, firstName: true, lastName: true },
	});
	if (existing) {
		throw new Error(
			`${[existing.firstName, existing.lastName].filter(Boolean).join(" ")} is already in the CRM.`,
		);
	}

	const contact = await db.$transaction(async (tx) => {
		if (email) {
			await tx.suppressedContact.deleteMany({ where: { email } });
		}

		const created = await tx.contact.create({
			data: {
				firstName,
				lastName,
				email,
				phone: nullable(input.phone),
				title: nullable(input.title),
				linkedinUrl,
				companyId: input.companyId ?? null,
				ownerId: input.ownerId ?? null,
			},
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				linkedinUrl: true,
			},
		});

		const pending = await tx.agentTask.findFirst({
			where: { contactId: created.id, kind: "identify", finishedAt: null },
			select: { id: true },
		});
		if (!pending) {
			await tx.agentTask.create({
				data: {
					contactId: created.id,
					companyId: null,
					kind: "identify",
					reason: "Added by the research agent after profile confirmation",
					priority: 100,
					budget: 4,
					dueAt: new Date(),
				},
			});
		}

		return created;
	});

	return contact;
}

export async function updateCompany(
	id: string,
	input: CompanyUpdate,
): Promise<{ id: string; name: string; domain: string | null }> {
	const data: Prisma.CompanyUpdateInput = {};
	const domain =
		input.domain === undefined ? undefined : normalizeDomain(input.domain);

	if (input.name !== undefined) data.name = input.name.trim();
	if (input.website !== undefined) data.website = nullable(input.website);
	if (input.description !== undefined)
		data.description = nullable(input.description);
	if (input.industry !== undefined) data.industry = nullable(input.industry);
	if (input.city !== undefined) data.city = nullable(input.city);
	if (input.stateCode !== undefined) data.stateCode = nullable(input.stateCode);
	if (input.country !== undefined) data.country = nullable(input.country);
	if (input.phone !== undefined) data.phone = nullable(input.phone);
	if (input.email !== undefined) data.email = nullable(input.email);
	if (input.linkedinUrl !== undefined)
		data.linkedinUrl = nullable(input.linkedinUrl);

	if (input.domain !== undefined) {
		if (input.domain?.trim() && !domain) {
			throw new Error(
				`"${input.domain}" is not a domain — try something like "stripe.com".`,
			);
		}
		data.domain = domain;
	}
	if (Object.keys(data).length === 0) {
		throw new Error("Name at least one field to update.");
	}

	return db.$transaction(async (tx) => {
		const current = await tx.company.findUnique({
			where: { id },
			select: { domain: true },
		});
		if (!current) throw new Error("No such company.");

		const domainChanged =
			input.domain !== undefined && current.domain !== domain;
		if (domainChanged) {
			data.enrichmentStatus = "PENDING";
			data.enrichmentError = null;
			data.iconUrl = null;
			data.iconDarkUrl = null;
			data.iconTone = null;
		}

		const company = await tx.company.update({
			where: { id },
			data,
			select: { id: true, name: true, domain: true },
		});

		if (domainChanged) {
			await enqueueCompanyTasks(tx, company.id, "Domain changed by the agent");
		}

		return company;
	});
}

export async function updateContact(
	id: string,
	input: ContactUpdate,
): Promise<{ id: string; firstName: string; lastName: string | null }> {
	const data: Prisma.ContactUpdateInput = {};

	if (input.firstName !== undefined) data.firstName = input.firstName.trim();
	if (input.lastName !== undefined) data.lastName = nullable(input.lastName);
	if (input.email !== undefined) data.email = normalizeEmail(input.email);
	if (input.phone !== undefined) data.phone = nullable(input.phone);
	if (input.title !== undefined) data.title = nullable(input.title);
	if (input.linkedinUrl !== undefined)
		data.linkedinUrl = nullable(input.linkedinUrl);
	if (input.twitterUrl !== undefined)
		data.twitterUrl = nullable(input.twitterUrl);
	if (input.githubUrl !== undefined) data.githubUrl = nullable(input.githubUrl);
	if (input.companyId !== undefined) {
		data.company = input.companyId
			? { connect: { id: input.companyId } }
			: { disconnect: true };
	}
	if (Object.keys(data).length === 0) {
		throw new Error("Name at least one field to update.");
	}

	return db.$transaction(async (tx) => {
		const contact = await tx.contact.update({
			where: { id },
			data,
			select: { id: true, firstName: true, lastName: true },
		});

		const email =
			input.email === undefined ? null : normalizeEmail(input.email);
		if (email) {
			await tx.suppressedContact.deleteMany({
				where: { email },
			});
		}

		return contact;
	});
}

export async function updateDeal(
	id: string,
	input: DealUpdate,
): Promise<{ id: string; name: string }> {
	const data: Prisma.DealUpdateInput = {};

	if (input.name !== undefined) data.name = input.name.trim();
	if (input.description !== undefined)
		data.description = nullable(input.description);
	if (input.companyId !== undefined) {
		data.company = { connect: { id: input.companyId } };
	}
	if (input.expectedCloseDate !== undefined) {
		data.expectedCloseDate = input.expectedCloseDate
			? parseDate(input.expectedCloseDate)
			: null;
	}
	if (Object.keys(data).length === 0) {
		throw new Error("Name at least one field to update.");
	}

	return db.deal.update({
		where: { id },
		data,
		select: { id: true, name: true },
	});
}

function nullable(value: string | null | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed || null;
}

function normalizeEmail(value: string | null | undefined): string | null {
	return nullable(value)?.toLowerCase() ?? null;
}

function parseDate(value: string): Date {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) throw new Error("That date is not valid.");
	return date;
}

async function enqueueCompanyTasks(
	tx: Prisma.TransactionClient,
	companyId: string,
	reason: string,
): Promise<void> {
	const kinds = ["brand", "company-profile"] as const;
	const existing = await tx.agentTask.findMany({
		where: { companyId, kind: { in: [...kinds] }, finishedAt: null },
		select: { kind: true },
	});
	const pending = new Set(existing.map((task) => task.kind));
	const dueAt = new Date();
	const tasks = kinds.flatMap((kind) =>
		pending.has(kind)
			? []
			: [
					{
						companyId,
						contactId: null,
						kind,
						reason,
						priority: kind === "brand" ? 900 : 40,
						budget: kind === "brand" ? 2 : 4,
						dueAt,
					},
				],
	);

	if (tasks.length > 0) await tx.agentTask.createMany({ data: tasks });
}

export function writeError(error: unknown): string {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		if (error.code === "P2025") return "That CRM record no longer exists.";
		if (error.code === "P2002") {
			return "Another CRM record already uses one of those unique values.";
		}
	}

	return error instanceof Error
		? error.message
		: "The CRM could not save that record.";
}
