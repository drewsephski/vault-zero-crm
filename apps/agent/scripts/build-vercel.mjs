import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const bun = process.env.BUN_BIN || "bun";

execFileSync(bun, ["x", "eve", "build"], {
	cwd: agentDirectory,
	env: process.env,
	stdio: "inherit",
});

if (process.env.VERCEL !== "1") process.exit(0);

const configPath = join(agentDirectory, ".vercel", "output", "config.json");

if (!existsSync(configPath)) {
	throw new Error(
		`Eve did not produce a Vercel output config at ${configPath}`,
	);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
delete config.crons;
writeFileSync(configPath, `${JSON.stringify(config)}\n`);
