import { organizationIdForUser } from "@crm/auth";
import { runInOrganization } from "@crm/db/tenancy";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import { setRequestUserId } from "../../logging/request-context";
import type { AuthedTrpcContext, BaseTrpcContext } from "../context.types";

@Injectable()
export class AuthMiddleware implements TRPCMiddleware {
	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const ctx = opts.ctx as BaseTrpcContext;
		const session = ctx.session;
		const user = session?.user;

		if (!session || !user) {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}

		const organizationId = await organizationIdForUser(
			user.id,
			session.session.activeOrganizationId,
		);

		if (!organizationId) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					"Your workspace could not be created. Sign in again in a moment.",
			});
		}

		setRequestUserId(user.id);

		const nextCtx: AuthedTrpcContext = {
			...ctx,
			session,
			user,
			organizationId,
		};
		return runInOrganization(organizationId, () => opts.next({ ctx: nextCtx }));
	}
}
