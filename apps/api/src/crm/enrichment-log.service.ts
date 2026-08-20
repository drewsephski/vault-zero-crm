import { ActivityType, type Db } from "@crm/db";
import { resolveAutomatedActivityAuthor } from "@crm/db/activity-author";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { ActivityStampService } from "./activity-stamp.service";

export type EnrichmentEvent = {
	companyId?: string | null;
	contactId?: string | null;
	subject: string;
	body?: string | null;
	meta?: Record<string, unknown>;
};

@Injectable()
export class EnrichmentLogService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
	) {}

	async record(event: EnrichmentEvent): Promise<string | null> {
		const author = await this.authorFor(event);
		if (!author) return null;

		const activity = await this.db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: event.subject,
				body: event.body ?? null,
				occurredAt: new Date(),
				companyId: event.companyId ?? null,
				contactId: event.contactId ?? null,
				createdById: author,
				meta: { ...event.meta, automated: true },
			},
			select: { id: true, createdAt: true },
		});

		await this.stamp.touch(
			{ companyId: event.companyId, contactId: event.contactId },
			activity.createdAt,
		);

		return activity.id;
	}

	private async authorFor(event: EnrichmentEvent): Promise<string | null> {
		const preferred: (string | null)[] = [];
		if (event.contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: event.contactId },
				select: { ownerId: true },
			});
			preferred.push(contact?.ownerId ?? null);
		}

		if (event.companyId) {
			const company = await this.db.company.findUnique({
				where: { id: event.companyId },
				select: { ownerId: true },
			});
			preferred.push(company?.ownerId ?? null);
		}

		return resolveAutomatedActivityAuthor(this.db, preferred);
	}
}

export function describeFilled(fields: readonly string[]): string | null {
	if (fields.length === 0) return null;
	if (fields.length === 1) return `Filled in ${fields[0]}.`;

	const last = fields[fields.length - 1];
	return `Filled in ${fields.slice(0, -1).join(", ")} and ${last}.`;
}
