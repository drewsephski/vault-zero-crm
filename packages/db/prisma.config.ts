import "@crm/env/load";

import path from "node:path";
import { defineConfig } from "prisma/config";
import { prismaDatasourceUrl } from "./datasource-url";

export default defineConfig({
	schema: path.join("prisma", "schema.prisma"),
	migrations: {
		path: path.join("prisma", "migrations"),
		seed: "bun run prisma/seed.ts",
	},
	datasource: {
		url: prismaDatasourceUrl(),
	},
});
