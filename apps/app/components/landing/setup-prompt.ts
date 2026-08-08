export const SETUP_PROMPT = `Set up Vault Zero CRM from https://github.com/drewsephski/vault-zero-crm in this workspace.

First read AGENTS.md, README.md, docs/setup.md, and docs/environment.md. Use Bun 1.3.12 and the existing lockfile. Inspect the current git status and preserve unrelated work.

Bootstrap a local development environment automatically:
1. Run bun install --frozen-lockfile.
2. Run docker compose up -d for local Postgres.
3. Create the root .env from .env.example.
4. Generate local secrets where appropriate without printing them.
5. Run bun run db:migrate automatically.
6. Start bun run dev in the background when needed.
7. Verify http://localhost:3000, http://localhost:3001, and the agent, then report any service that could not start.

Ask me for values you cannot know, such as ALLOWED_SIGN_IN and Google OAuth credentials. Do not touch production, commit .env files, invent credentials, reset or delete data, or make unrelated code changes.

Finish with the commands you ran, the configuration values still needed, the local URLs, and any verification gaps.`;
