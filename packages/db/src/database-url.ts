type DatabaseEnvironment = {
	DATABASE_URL?: string;
	DATABASE_URL_UNPOOLED?: string;
	DIRECT_DATABASE_URL?: string;
	POSTGRES_URL_NON_POOLING?: string;
};

export function resolvePrismaDatabaseUrl(
	environment: DatabaseEnvironment,
): string {
	const configured =
		environment.DIRECT_DATABASE_URL ??
		environment.POSTGRES_URL_NON_POOLING ??
		environment.DATABASE_URL_UNPOOLED ??
		environment.DATABASE_URL ??
		"";

	if (!configured) {
		throw new Error("DATABASE_URL is required for Prisma commands.");
	}

	if (
		environment.DIRECT_DATABASE_URL ||
		environment.POSTGRES_URL_NON_POOLING ||
		environment.DATABASE_URL_UNPOOLED
	) {
		return configured;
	}

	try {
		const url = new URL(configured);
		if (url.hostname.endsWith(".neon.tech")) {
			url.hostname = url.hostname.replace("-pooler.", ".");
		}
		return url.toString();
	} catch {
		return configured;
	}
}
