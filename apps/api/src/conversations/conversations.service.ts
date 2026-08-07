import type { Db } from "@crm/db";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import {
	BadRequestException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import type { Cache } from "cache-manager";
import { InjectDatabase } from "../database/database.constants";
import type {
	ConversationEventsInput,
	ConversationListInput,
	ConversationSaveInput,
} from "./conversations.contracts";

export interface ConversationSummary {
	id: string;
	sessionId: string;
	continuationToken: string | null;
	streamIndex: number;
	title: string | null;
	messageCount: number;
	lastMessageAt: string;
}

type ScopeInput = {
	scope?: "workspace";
	contactId?: string;
	companyId?: string;
	dealId?: string;
};

type Scope = {
	key: string;
	fields: {
		contactId?: string | null;
		companyId?: string | null;
		dealId?: string | null;
	};
};

const LIST_TTL_MS = 10 * 60_000;

const listKey = (userId: string, scope: string) =>
	`agent:conversations:${userId}:${scope}`;

@Injectable()
export class ConversationsService {
	private readonly logger = new Logger(ConversationsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	async list(
		input: ConversationListInput,
		userId: string,
	): Promise<ConversationSummary[]> {
		const scope = this.scope(input);
		const key = listKey(userId, scope.key);

		const cached = await this.cache.get<ConversationSummary[]>(key);
		if (cached) return cached;

		this.logger.debug({
			message: "Conversation list cache miss",
			scope: scope.key,
		});

		const rows = await this.db.agentConversation.findMany({
			where: {
				userId,
				...scope.fields,
			},
			orderBy: { lastMessageAt: "desc" },
			take: 20,
			select: {
				id: true,
				sessionId: true,
				continuationToken: true,
				streamIndex: true,
				title: true,
				messageCount: true,
				lastMessageAt: true,
			},
		});

		const summaries = rows.map((row) => ({
			...row,
			lastMessageAt: row.lastMessageAt.toISOString(),
		}));

		await this.cache.set(key, summaries, LIST_TTL_MS);

		return summaries;
	}

	async save(
		input: ConversationSaveInput,
		userId: string,
	): Promise<{ id: string }> {
		const scope = this.scope(input);
		const existing = await this.db.agentConversation.findUnique({
			where: { sessionId: input.sessionId },
			select: {
				id: true,
				userId: true,
				contactId: true,
				companyId: true,
				dealId: true,
			},
		});

		if (existing && existing.userId !== userId) {
			throw new BadRequestException(
				"That conversation belongs to someone else.",
			);
		}

		if (existing && this.storedScope(existing).key !== scope.key) {
			throw new BadRequestException(
				"That conversation already belongs to another scope.",
			);
		}

		const data = {
			continuationToken: input.continuationToken ?? null,
			streamIndex: input.streamIndex ?? 0,
			messageCount: input.messageCount ?? 0,
			lastMessageAt: new Date(),
		};

		const conversation = existing
			? await this.db.agentConversation.update({
					where: { id: existing.id },
					data,
					select: { id: true },
				})
			: await this.db.agentConversation.create({
					data: {
						sessionId: input.sessionId,
						...data,
						title: input.title?.slice(0, 120) ?? null,
						userId,
						contactId: scope.fields.contactId ?? null,
						companyId: scope.fields.companyId ?? null,
						dealId: scope.fields.dealId ?? null,
					},
					select: { id: true },
				});

		await this.cache.del(listKey(userId, scope.key));

		return { id: conversation.id };
	}

	async events(input: ConversationEventsInput, userId: string) {
		const conversation = await this.db.agentConversation.findUnique({
			where: { id: input.id },
			select: { sessionId: true, userId: true },
		});

		if (!conversation || conversation.userId !== userId) {
			throw new NotFoundException(`No conversation with id ${input.id}.`);
		}

		const events = await this.db.agentEvent.findMany({
			where: { sessionId: conversation.sessionId },
			orderBy: { emittedAt: "asc" },
			take: input.limit,
			select: { id: true, type: true, data: true, emittedAt: true },
		});

		return events.map((event) => ({
			type: event.type,
			data: event.data,
			meta: { id: event.id, at: event.emittedAt.toISOString() },
		}));
	}

	async remove(id: string, userId: string): Promise<{ id: string }> {
		const conversation = await this.db.agentConversation.findUnique({
			where: { id },
			select: {
				id: true,
				userId: true,
				contactId: true,
				companyId: true,
				dealId: true,
				sessionId: true,
			},
		});

		if (!conversation || conversation.userId !== userId) {
			throw new NotFoundException(`No conversation with id ${id}.`);
		}

		await this.db.$transaction([
			this.db.agentEvent.deleteMany({
				where: { sessionId: conversation.sessionId },
			}),
			this.db.agentConversation.delete({ where: { id } }),
		]);

		const scope = this.storedScope(conversation);
		await this.cache.del(listKey(userId, scope.key));

		this.logger.log({ message: "Conversation removed", conversationId: id });

		return { id };
	}

	private scope(input: ScopeInput): Scope {
		const choices = [
			input.scope === "workspace",
			Boolean(input.contactId),
			Boolean(input.companyId),
			Boolean(input.dealId),
		].filter(Boolean).length;

		if (choices !== 1) {
			throw new BadRequestException(
				"A conversation belongs to the workspace, a contact, a company or a deal.",
			);
		}

		if (input.scope === "workspace") {
			return {
				key: "workspace",
				fields: { contactId: null, companyId: null, dealId: null },
			};
		}

		if (input.contactId) {
			return {
				key: `contact:${input.contactId}`,
				fields: { contactId: input.contactId },
			};
		}

		if (input.companyId) {
			return {
				key: `company:${input.companyId}`,
				fields: { companyId: input.companyId },
			};
		}

		return {
			key: `deal:${input.dealId}`,
			fields: { dealId: input.dealId },
		};
	}

	private storedScope(fields: {
		contactId: string | null;
		companyId: string | null;
		dealId: string | null;
	}): Scope {
		return this.scope({
			...(fields.contactId ? { contactId: fields.contactId } : {}),
			...(fields.companyId ? { companyId: fields.companyId } : {}),
			...(fields.dealId ? { dealId: fields.dealId } : {}),
			...(!fields.contactId && !fields.companyId && !fields.dealId
				? { scope: "workspace" as const }
				: {}),
		});
	}
}
