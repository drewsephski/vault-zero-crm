import { SYNC_SCOPES } from "@crm/auth/scopes";

export function googleConnectionRequest(origin: string, workspaceRoot: string) {
	const root = workspaceRoot.replace(/\/+$/, "");
	const callbackURL = `${origin}${root}/settings/connections`;

	return {
		provider: "google" as const,
		scopes: [...SYNC_SCOPES],
		callbackURL,
		errorCallbackURL: callbackURL,
		additionalParams: {
			access_type: "offline",
			prompt: "consent",
		},
	};
}
