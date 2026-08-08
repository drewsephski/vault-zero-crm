import { Inject } from "@nestjs/common";
import { Ctx, Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { outreachListInput, outreachStatusInput } from "./outreach.contracts";
import { OutreachService } from "./outreach.service";

@Router({ alias: "outreach" })
@UseMiddlewares(AuthMiddleware)
export class OutreachRouter {
	constructor(@Inject(OutreachService) private readonly outreach: OutreachService) {}

	@Query({ input: outreachListInput })
	async list(@Input() input: z.infer<typeof outreachListInput>) {
		return this.outreach.list(input);
	}

	@Mutation({ input: outreachStatusInput })
	async setStatus(
		@Ctx() _ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof outreachStatusInput>,
	) {
		return this.outreach.setStatus(input);
	}
}
