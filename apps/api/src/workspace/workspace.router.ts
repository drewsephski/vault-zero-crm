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
	createWorkspaceInput,
	memberListInput,
	setMemberRoleInput,
	setWorkspaceModeInput,
	switchWorkspaceInput,
	updateAcquisitionProfileInput,
	updateWorkspaceInput,
} from "./workspace.contracts";
import { WorkspaceService } from "./workspace.service";

@Router({ alias: "workspace" })
@UseMiddlewares(AuthMiddleware)
export class WorkspaceRouter {
	constructor(
		@Inject(WorkspaceService) private readonly workspace: WorkspaceService,
	) {}

	@Query()
	async get(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.get(ctx.user.id);
	}

	@Query()
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.list(ctx.user.id, ctx.organizationId);
	}

	@Query()
	async acquisitionProfile(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.acquisitionProfile(ctx.user.id);
	}

	@Query({ input: memberListInput })
	async members(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof memberListInput>,
	) {
		return this.workspace.members(ctx.user.id, input);
	}

	@Mutation({ input: updateWorkspaceInput })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateWorkspaceInput>,
	) {
		return this.workspace.update(ctx.user.id, input);
	}

	@Mutation({ input: createWorkspaceInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createWorkspaceInput>,
	) {
		return this.workspace.create(ctx.user.id, ctx.session.session.id, input);
	}

	@Mutation({ input: switchWorkspaceInput })
	async switch(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("organizationId") organizationId: string,
	) {
		return this.workspace.switch(
			ctx.user.id,
			ctx.session.session.id,
			organizationId,
		);
	}

	@Mutation({ input: setWorkspaceModeInput })
	async setMode(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setWorkspaceModeInput>,
	) {
		return this.workspace.setMode(ctx.user.id, input);
	}

	@Mutation({ input: updateAcquisitionProfileInput })
	async updateAcquisitionProfile(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateAcquisitionProfileInput>,
	) {
		return this.workspace.updateAcquisitionProfile(ctx.user.id, input);
	}

	@Mutation({ input: setMemberRoleInput })
	async setMemberRole(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setMemberRoleInput>,
	) {
		return this.workspace.setMemberRole(ctx.user.id, input);
	}
}
