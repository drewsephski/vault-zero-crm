import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
	Body,
	Controller,
	ForbiddenException,
	Headers,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { VaultZeroService } from "./vault-zero.service";

const MAX_CLOCK_SKEW_SECONDS = 300;

@Controller("internal/vault-zero")
export class VaultZeroController {
	private readonly secret: string | undefined;

	constructor(
		private readonly vaultZero: VaultZeroService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("VAULTZERO_INGEST_SECRET", { infer: true });
	}

	@Post("events")
	@AllowAnonymous()
	async ingest(
		@Headers("x-vault-zero-event-id") eventId: string | undefined,
		@Headers("x-vault-zero-timestamp") timestamp: string | undefined,
		@Headers("x-vault-zero-signature") signature: string | undefined,
		@Body() body: unknown,
	) {
		if (!this.secret) {
			throw new ServiceUnavailableException(
				"Vault Zero ingestion is not configured.",
			);
		}

		if (!eventId || !timestamp || !signature || !isFreshTimestamp(timestamp)) {
			throw new ForbiddenException();
		}

		const bodyEventId = readEventId(body);
		if (bodyEventId !== eventId) throw new ForbiddenException();

		const bodyHash = createHash("sha256")
			.update(JSON.stringify(body))
			.digest("hex");
		const canonical = `${timestamp}.${eventId}.${bodyHash}`;
		const expected = createHmac("sha256", this.secret)
			.update(canonical)
			.digest("hex");
		if (!safeEquals(signature, expected)) throw new ForbiddenException();

		return this.vaultZero.ingest(body);
	}
}

function isFreshTimestamp(value: string): boolean {
	if (!/^\d+$/.test(value)) return false;
	return (
		Math.abs(Math.floor(Date.now() / 1000) - Number(value)) <=
		MAX_CLOCK_SKEW_SECONDS
	);
}

function safeEquals(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}

function readEventId(body: unknown): string | undefined {
	if (!body || typeof body !== "object" || !("eventId" in body))
		return undefined;
	const eventId = body.eventId;
	return typeof eventId === "string" ? eventId : undefined;
}
