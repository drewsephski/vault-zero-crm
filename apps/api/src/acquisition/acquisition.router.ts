import { Inject } from "@nestjs/common";
import { Ctx, Input, Mutation, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	acquisitionCandidateIdInput,
	addAcquisitionTargetInput,
	createAcquisitionTargetInput,
	updateAcquisitionTargetInput,
} from "./acquisition.contracts";
import { AcquisitionService } from "./acquisition.service";

@Router({ alias: "acquisition" })
@UseMiddlewares(AuthMiddleware)
export class AcquisitionRouter {
	constructor(
		@Inject(AcquisitionService)
		private readonly acquisition: AcquisitionService,
	) {}

	@Mutation({ input: createAcquisitionTargetInput })
	async createTarget(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createAcquisitionTargetInput>,
	) {
		return this.acquisition.createTarget(input, ctx.user.id);
	}

	@Mutation({ input: addAcquisitionTargetInput })
	async addTarget(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("companyId") companyId: string,
	) {
		return this.acquisition.addTarget(companyId, ctx.user.id);
	}

	@Mutation({ input: acquisitionCandidateIdInput })
	async approveCandidate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("id") id: string,
	) {
		return this.acquisition.approveCandidate(id, ctx.user.id);
	}

	@Mutation({ input: acquisitionCandidateIdInput })
	async dismissCandidate(@Input("id") id: string) {
		return this.acquisition.dismissCandidate(id);
	}

	@Mutation({ input: updateAcquisitionTargetInput })
	async updateTarget(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateAcquisitionTargetInput>,
	) {
		return this.acquisition.updateTarget(
			input.companyId,
			input.stage,
			ctx.user.id,
		);
	}
}
