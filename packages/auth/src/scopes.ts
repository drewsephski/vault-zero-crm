export const GOOGLE_PROVIDER_ID = "google";
export const MICROSOFT_PROVIDER_ID = "microsoft";

export const IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const CALENDAR_SCOPE =
	"https://www.googleapis.com/auth/calendar.readonly";

export const SYNC_SCOPES = [
	GMAIL_SCOPE,
	GMAIL_SEND_SCOPE,
	CALENDAR_SCOPE,
] as const;

export const REQUIRED_SCOPES = [...IDENTITY_SCOPES, ...SYNC_SCOPES] as const;

export function hasSyncScopes(scope: string | null | undefined): boolean {
	const granted = parseScopes(scope);
	return SYNC_SCOPES.every((needed) => granted.has(needed));
}

export type SignInAccount = {
	providerId: string;
	scope?: string | null;
};

export function signsInWithGoogle(accounts: readonly SignInAccount[]): boolean {
	return (
		accounts.length > 0 &&
		accounts.every((account) => account.providerId === GOOGLE_PROVIDER_ID)
	);
}

export function needsGoogleGrant(accounts: readonly SignInAccount[]): boolean {
	if (!signsInWithGoogle(accounts)) return false;

	return !accounts.some((account) => hasSyncScopes(account.scope));
}

export function parseScopes(scope: string | null | undefined): Set<string> {
	return new Set(
		(scope ?? "")
			.split(/[,\s]+/)
			.map((entry) => entry.trim())
			.filter(Boolean),
	);
}
