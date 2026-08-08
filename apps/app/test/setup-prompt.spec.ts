import { describe, expect, it } from "bun:test";
import { SETUP_PROMPT } from "../components/landing/setup-prompt";

describe("SETUP_PROMPT", () => {
	it("contains the complete local bootstrap workflow", () => {
		expect(SETUP_PROMPT).toContain("https://github.com/trycompai/crm");
		expect(SETUP_PROMPT).toContain("AGENTS.md");
		expect(SETUP_PROMPT).toContain("bun install --frozen-lockfile");
		expect(SETUP_PROMPT).toContain("docker compose up -d");
		expect(SETUP_PROMPT).toContain(".env.example");
		expect(SETUP_PROMPT).toContain("bun run db:migrate");
		expect(SETUP_PROMPT).toContain("bun run dev");
		expect(SETUP_PROMPT).toContain("ALLOWED_SIGN_IN");
		expect(SETUP_PROMPT).toContain("Do not touch production");
	});
});
