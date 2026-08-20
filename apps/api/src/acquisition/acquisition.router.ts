import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	acceptRecommendedActionInput,
	acceptRecommendedStageInput,
	acquisitionCandidateIdInput,
	addAcquisitionTargetInput,
	createAcquisitionTargetInput,
	dismissRecommendedActionInput,
	dismissRecommendedStageInput,
	updateAcquisitionTargetInput,
} from "./acquisition.contracts";
import { AcquisitionService } from "./acquisition.service";
import {
	createAcquisitionEngagementInput,
	engagementTargetOptionsInput,
	listAcquisitionEngagementsInput,
	updateAcquisitionEngagementStageInput,
} from "./acquisition-engagements.contracts";
import {
	listResearchRunsInput,
	researchRunIdInput,
} from "./acquisition-research-runs.contracts";

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

	@Mutation({ input: acceptRecommendedStageInput })
	async acceptRecommendedStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof acceptRecommendedStageInput>,
	) {
		return this.acquisition.acceptRecommendedStage(
			input.companyId,
			ctx.user.id,
			input.idempotencyKey,
		);
	}

	@Mutation({ input: dismissRecommendedStageInput })
	async dismissRecommendedStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dismissRecommendedStageInput>,
	) {
		return this.acquisition.dismissRecommendedStage(
			input.companyId,
			ctx.user.id,
		);
	}

	@Mutation({ input: acceptRecommendedActionInput })
	async acceptRecommendedAction(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof acceptRecommendedActionInput>,
	) {
		return this.acquisition.acceptRecommendedAction(
			input.companyId,
			ctx.user.id,
			input.idempotencyKey,
			input.dueAt,
		);
	}

	@Mutation({ input: dismissRecommendedActionInput })
	async dismissRecommendedAction(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dismissRecommendedActionInput>,
	) {
		return this.acquisition.dismissRecommendedAction(
			input.companyId,
			ctx.user.id,
		);
	}

	@Mutation({ input: createAcquisitionEngagementInput })
	async createEngagement(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createAcquisitionEngagementInput>,
	) {
		return this.acquisition.createEngagement(input, ctx.user.id);
	}

	@Query({ input: listAcquisitionEngagementsInput })
	async listEngagements(
		@Input() input: z.infer<typeof listAcquisitionEngagementsInput>,
	) {
		return this.acquisition.listEngagements(input);
	}

	@Query({ input: engagementTargetOptionsInput })
	async engagementTargetOptions(
		@Input() input: z.infer<typeof engagementTargetOptionsInput>,
	) {
		return this.acquisition.engagementTargetOptions(input);
	}

	@Mutation({ input: updateAcquisitionEngagementStageInput })
	async updateEngagementStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateAcquisitionEngagementStageInput>,
	) {
		return this.acquisition.updateEngagementStage(input, ctx.user.id);
	}

	@Query({ input: listResearchRunsInput })
	async listResearchRuns(
		@Input() input: z.infer<typeof listResearchRunsInput>,
	) {
		return this.acquisition.listResearchRuns(input);
	}

	@Query({ input: researchRunIdInput })
	async getResearchRun(@Input() input: z.infer<typeof researchRunIdInput>) {
		return this.acquisition.getResearchRun(input);
	}
}
