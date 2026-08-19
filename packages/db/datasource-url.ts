export const LOCAL_DATABASE_URL =
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public";

export function prismaDatasourceUrl(value = process.env.DATABASE_URL) {
	return value || LOCAL_DATABASE_URL;
}
