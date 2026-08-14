import { Client } from "pg";

const LOCK_NAMESPACE = 20_260_813;
const CANONICAL_WORKSPACE = 1;

export function isCanonicalLocalTestDatabase(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.hostname === "127.0.0.1" &&
			url.port === "5432" &&
			url.pathname === "/crm"
		);
	} catch {
		return false;
	}
}

export async function acquireCanonicalWorkspaceFixture(): Promise<
	() => Promise<void>
> {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString)
		throw new Error("DATABASE_URL is required for DB fixtures.");
	if (!isCanonicalLocalTestDatabase(connectionString)) {
		throw new Error(
			"Canonical workspace fixtures require the local CRM database.",
		);
	}

	const client = new Client({ connectionString });
	await client.connect();

	try {
		await client.query("BEGIN");
		await client.query(
			"SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
			[LOCK_NAMESPACE, CANONICAL_WORKSPACE],
		);
	} catch (error) {
		await client.query("ROLLBACK").catch(() => undefined);
		await client.end();
		throw error;
	}

	let released = false;
	return async () => {
		if (released) return;
		released = true;
		try {
			await client.query("COMMIT");
		} finally {
			await client.end();
		}
	};
}
