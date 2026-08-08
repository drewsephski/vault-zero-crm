const data = await Bun.file(".tmp-outreach-import.json").json();
const { db } = await import("./packages/db/src/client.ts");
const { ActivityType, EmailDirection, OutreachStatus, RecordSource } = await import("./packages/db/src/generated/prisma/enums.ts");

const owner = await db.user.findUnique({ where: { email: "drewsepeczi@gmail.com" }, select: { id: true } });
if (!owner) throw new Error("Drew's Gmail user is not present in the CRM.");
const ownerId = owner.id;
const freeDomains = new Set(["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "sbcglobal.net", "comcast.net", "aol.com", "icloud.com"]);
const domainFor = (email: string) => {
	const domain = email.split("@")[1] ?? "";
	return freeDomains.has(domain) ? null : domain;
};
const contactName = (lead: any) => {
	const value = (lead.recipientName ?? "").trim();
	if (value && !/^(info|office|contact|general|customerservice|assessment|bids)$/i.test(value)) {
		const parts = value.split(/\s+/);
		return { firstName: parts[0] ?? lead.companyName, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
	}
	return { firstName: lead.companyName, lastName: null };
};
const latest = (lead: any) => new Date(Math.max(...lead.messages.map((message: any) => new Date(message.sentAt).getTime())));
const result = await db.$transaction(async (tx) => {
	await tx.activity.deleteMany({});
	await tx.emailMessage.deleteMany({});
	await tx.emailThread.deleteMany({});
	await tx.calendarAttendee.deleteMany({});
	await tx.calendarEvent.deleteMany({});
	await tx.outreachLead.deleteMany({});
	await tx.vaultZeroProposal.deleteMany({});
	await tx.vaultZeroLead.deleteMany({});
	await tx.vaultZeroEvent.deleteMany({});
	await tx.dealContact.deleteMany({});
	await tx.deal.deleteMany({});
	await tx.contactFact.deleteMany({});
	await tx.contactBrief.deleteMany({});
	await tx.contact.deleteMany({});
	await tx.company.deleteMany({});
	await tx.suppressedContact.deleteMany({});
	await tx.suppressedDomain.deleteMany({});
	await tx.agentEvent.deleteMany({});
	await tx.agentTask.deleteMany({});
	await tx.agentConversation.deleteMany({});
	await tx.user.deleteMany({ where: { id: { not: ownerId } } });

	const companyCache = new Map();
	let messagesWritten = 0;
	let leadsWritten = 0;
	let threadsWritten = 0;
	let bounced = 0;

	for (const lead of data) {
		const domain = domainFor(lead.email);
		const cacheKey = domain ? "domain:" + domain : "name:" + lead.companyName.toLowerCase();
		let company = companyCache.get(cacheKey);
		if (!company) {
			company = domain
				? await tx.company.upsert({
						where: { domain },
						create: { name: lead.companyName, domain, website: "https://" + domain, industry: lead.vertical, ownerId, source: RecordSource.EMAIL, enrichmentStatus: "SKIPPED" },
						update: { industry: lead.vertical, ownerId, source: RecordSource.EMAIL, enrichmentStatus: "SKIPPED" },
						select: { id: true, name: true },
					})
				: await tx.company.findFirst({ where: { name: lead.companyName } }) ?? await tx.company.create({
						data: { name: lead.companyName, industry: lead.vertical, ownerId, source: RecordSource.EMAIL, enrichmentStatus: "SKIPPED" },
						select: { id: true, name: true },
					});
			companyCache.set(cacheKey, company);
		}

		const name = contactName(lead);
		const contact = await tx.contact.create({ data: { firstName: name.firstName, lastName: name.lastName, email: lead.email, companyId: company.id, ownerId, source: RecordSource.EMAIL }, select: { id: true } });
		await tx.company.update({ where: { id: company.id }, data: { primaryContactId: contact.id } });
		const firstMessageAt = new Date(lead.messages[0].sentAt);
		const lastMessageAt = latest(lead);
		const thread = await tx.emailThread.create({ data: { rootMessageId: lead.rootMessageId, subject: lead.messages[0].subject, companyId: company.id, contactId: contact.id, firstMessageAt, lastMessageAt, messageCount: lead.messages.length }, select: { id: true } });
		await tx.emailMessage.createMany({ data: lead.messages.map((message: any) => ({ threadId: thread.id, rfcMessageId: message.rfcMessageId, syncedByUserId: ownerId, gmailMessageId: message.gmailMessageId, direction: message.direction === "OUTBOUND" ? EmailDirection.OUTBOUND : EmailDirection.INBOUND, fromEmail: message.fromEmail, fromName: message.fromName, recipients: message.recipients, subject: message.subject, snippet: message.snippet, body: message.body, sentAt: new Date(message.sentAt) })) });
		await tx.activity.create({ data: { type: ActivityType.EMAIL, subject: lead.lastSubject, body: lead.lastNote, occurredAt: lastMessageAt, companyId: company.id, contactId: contact.id, createdById: ownerId, emailThreadId: thread.id, meta: { source: "gmail", gmailThreadId: lead.sourceThreadId, messageCount: lead.messageCount, status: lead.status } } });
		await tx.outreachLead.create({ data: { companyName: lead.companyName, email: lead.email, vertical: lead.vertical, status: lead.status, source: "GMAIL", sourceThreadId: lead.sourceThreadId, lastSubject: lead.lastSubject, lastNote: lead.lastNote, messageCount: lead.messageCount, lastContactedAt: lead.lastContactedAt ? new Date(lead.lastContactedAt) : null, lastRespondedAt: lead.lastRespondedAt ? new Date(lead.lastRespondedAt) : null, companyId: company.id, contactId: contact.id, ownerId } });
		if (lead.status === OutreachStatus.BOUNCED) {
			await tx.suppressedContact.create({ data: { email: lead.email, reason: "Gmail delivery failure recorded during outreach import." } });
			bounced += 1;
		}
		await tx.company.update({ where: { id: company.id }, data: { lastActivityAt: lastMessageAt } });
		await tx.contact.update({ where: { id: contact.id }, data: { lastActivityAt: lastMessageAt } });
		messagesWritten += lead.messages.length;
		leadsWritten += 1;
		threadsWritten += 1;
	}

	return { leadsWritten, threadsWritten, messagesWritten, bounced, companiesWritten: companyCache.size };
}, { timeout: 120000 });
await db.$disconnect();
console.log(JSON.stringify(result));
