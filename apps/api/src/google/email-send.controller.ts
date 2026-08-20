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
import { emailSendInput } from "./email-send.contracts";
import { EmailSendService } from "./email-send.service";

@Controller("internal/google")
export class EmailSendController {
	private readonly secret: string | undefined;

	constructor(
		private readonly sends: EmailSendService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("AGENT_BRIDGE_SECRET", { infer: true });
	}

	@Post("send")
	@AllowAnonymous()
	async send(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		if (!this.secret)
			throw new ServiceUnavailableException("Agent email is not configured.");
		if (!this.equal(authorization ?? "", `Bearer ${this.secret}`))
			throw new ForbiddenException();

		const input = emailSendInput.safeParse(body);
		if (!input.success)
			return {
				outcome: "failed" as const,
				reason: "The approved email was invalid.",
			};
		return this.sends.send(input.data);
	}

	private equal(a: string, b: string): boolean {
		if (a.length !== b.length) return false;
		let mismatch = 0;
		for (let index = 0; index < a.length; index += 1)
			mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
		return mismatch === 0;
	}
}
