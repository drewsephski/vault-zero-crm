import {
	type Db,
	OutreachStatus,
	type OutreachStatus as OutreachStatusType,
	Prisma,
} from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	FACET_ALL,
	type ListResult,
	ownerFilter,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	OutreachListInput,
	OutreachStatusInput,
} from "./outreach.contracts";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

export type OutreachLeadRow = {
	id: string;
	companyName: string;
	email: string;
	vertical: string | null;
	status: OutreachStatusType;
	source: string;
	lastSubject: string | null;
	lastNote: string | null;
	messageCount: number;
	lastContactedAt: string | null;
	lastRespondedAt: string | null;
	nextActionAt: string | null;
	company: { id: string; name: string } | null;
	contact: { id: string; firstName: string; lastName: string | null } | null;
	owner: { id: string; name: string; email: string; image: string | null };
	createdAt: string;
};

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.OutreachLeadOrderByWithRelationInput
> = {
	company: (dir) => ({ companyName: dir }),
	email: (dir) => ({ email: dir }),
	vertical: (dir) => ({ vertical: dir }),
	status: (dir) => ({ status: dir }),
	lastContacted: (dir) => ({ lastContactedAt: { sort: dir, nulls: "last" } }),
	createdAt: (dir) => ({ createdAt: dir }),
};

@Injectable()
export class OutreachService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(input: OutreachListInput): Promise<ListResult<OutreachLeadRow>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const [rows, total, statusGroups, verticalGroups] = await Promise.all([
			this.db.outreachLead.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, { lastContactedAt: "desc" }),
				select: {
					id: true,
					companyName: true,
					email: true,
					vertical: true,
					status: true,
					source: true,
					lastSubject: true,
					lastNote: true,
					messageCount: true,
					lastContactedAt: true,
					lastRespondedAt: true,
					nextActionAt: true,
					company: { select: { id: true, name: true } },
					contact: { select: { id: true, firstName: true, lastName: true } },
					owner: { select: OWNER_SELECT },
					createdAt: true,
				},
			}),
			this.db.outreachLead.count({ where }),
			this.db.outreachLead.groupBy({
				by: ["status"],
				where,
				_count: { _all: true },
			}),
			this.db.outreachLead.groupBy({
				by: ["vertical"],
				where,
				_count: { _all: true },
			}),
		]);

		return {
			rows: rows.map((row) => ({
				...row,
				lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
				lastRespondedAt: row.lastRespondedAt?.toISOString() ?? null,
				nextActionAt: row.nextActionAt?.toISOString() ?? null,
				createdAt: row.createdAt.toISOString(),
			})),
			total,
			facetCounts: {
				status: countsByKey(statusGroups, "status"),
				vertical: countsByKey(verticalGroups, "vertical"),
			},
		};
	}

	async setStatus(input: OutreachStatusInput) {
		try {
			return await this.db.outreachLead.update({
				where: { id: input.id },
				data: {
					status: input.status,
					...(input.lastNote !== undefined ? { lastNote: input.lastNote } : {}),
				},
				select: { id: true, status: true },
			});
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2025"
			) {
				throw new NotFoundException(`No outreach lead with id ${input.id}.`);
			}
			throw error;
		}
	}

	private buildWhere(input: OutreachListInput): Prisma.OutreachLeadWhereInput {
		const where: Prisma.OutreachLeadWhereInput = {};
		const q = input.q.trim();
		if (q) {
			where.OR = [
				{ companyName: { contains: q, mode: "insensitive" } },
				{ email: { contains: q, mode: "insensitive" } },
				{ lastSubject: { contains: q, mode: "insensitive" } },
			];
		}
		if (input.status !== FACET_ALL)
			where.status = input.status as OutreachStatus;
		if (input.vertical !== FACET_ALL) where.vertical = input.vertical;
		const owner = ownerFilter(input.owner);
		if (owner) Object.assign(where, owner);
		return where;
	}
}
