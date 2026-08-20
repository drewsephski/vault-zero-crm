import { describe, expect, it } from "bun:test";
import { googleConnectionRequest } from "../lib/google-connection";

describe("googleConnectionRequest", () => {
	it("requests sync scopes and a durable refresh token", () => {
		expect(
			googleConnectionRequest("https://crm.vaultzero.dev", "/drreew"),
		).toMatchObject({
			provider: "google",
			callbackURL: "https://crm.vaultzero.dev/drreew/settings/connections",
			errorCallbackURL: "https://crm.vaultzero.dev/drreew/settings/connections",
			additionalParams: {
				access_type: "offline",
				prompt: "consent",
			},
		});
	});
});
