import type { Session, SessionUser } from "@crm/auth";
import type { Request } from "express";

export type BaseTrpcContext = {
	req?: Request;
	session: Session | null;
};

export type AuthedTrpcContext = BaseTrpcContext & {
	session: Session;
	user: SessionUser;
	organizationId: string;
};
