# AI inference and web research options for the CRM

Date: 2026-08-06

## Recommendation

Use OpenRouter as Eve's direct AI SDK model provider, but do not make OpenRouter's metered web-search server tool the only research path if the goal is a recurring zero-dollar install.

For the immediate self-hosted setup:

1. Use `@openrouter/ai-sdk-provider` with a pinned, tool-capable `:free` model for development and low-volume use.
2. Replace the Perplexity helper with a provider-neutral research adapter backed by Tavily's recurring free tier, with Brave Search as the next alternative.
3. Optionally support OpenRouter's `openrouter:web_search` as a second research backend for users who value one-key setup and accept metered search.
4. Apply for Google for Startups first if eligible: its current Scale-tier perks include $1,000 in OpenRouter credits with zero processing fees for 12 months.
5. Treat free inference as a bootstrap mode, not the production reliability target. Preserve a pinned paid-model option and enforce task/request budgets.

## What the repository does today

- `apps/agent/agent/agent.ts` gives Eve a string model ID. Eve resolves that string through Vercel AI Gateway.
- `packages/db/src/settings.ts` stores a Gateway-style default model ID and context window.
- `apps/api/src/settings/model-catalog.service.ts` loads the model picker from the Vercel AI Gateway catalog.
- `apps/api/src/settings/settings.service.ts` validates saved model IDs against that catalog.
- `apps/agent/agent/lib/perplexity.ts` calls Perplexity directly and preserves answer text plus citations.
- Perplexity is used by person research, LinkedIn candidate discovery, and social-profile discovery. Replacing it requires migrating all three consumers, not only the visible `research_person` tool.
- Eve's installed provider-tool resolver only auto-provisions web search for direct OpenAI, Anthropic, and Google models. A direct OpenRouter model therefore needs an explicit OpenRouter provider tool or a custom Eve `web_search` override.

This means OpenRouter is feasible, but it is a provider migration across agent construction, model catalog/settings, environment documentation, capabilities, UI copy, and tests. It is not safely completed by changing one model string.

## Provider comparison

Scores emphasize fit for a self-hosted CRM agent with tools, citations, low initial spend, and minimal architectural churn.

| Option | Recurring free allowance | Eve and AI SDK fit | Research fit | Production caveat | Score |
| --- | --- | --- | --- | --- | ---: |
| OpenRouter direct | 25+ free models; 50 free-model requests/day without purchased credits | Excellent through the official/community AI SDK provider; current v3 targets AI SDK v7 and Node 22 | Supported through an explicit OpenRouter server tool, but search is separately metered | Free model availability and latency vary; routing and upstream data policies require care | 8.6/10 |
| Google Gemini Developer API | Free input/output on eligible models with model-specific limits | Strong; Eve natively recognizes Google's web-search tool | Strongest single-provider technical path | Free-tier content is used to improve Google products, so it is a poor default for private CRM data | 7.8/10 |
| Groq | Free-plan limits include 1,000 requests/day for several capable models and 250/day for Compound | Good AI SDK model-provider option | Search needs a separate custom tool | Narrower model catalog and free quotas; Eve does not auto-provision Groq search | 7.2/10 |
| Cloudflare Workers AI | 10,000 neurons/day | Viable through an AI SDK provider or custom adapter | Search needs a separate backend | More integration work and model/tool capability must be validated model by model | 6.8/10 |
| AWS Bedrock with Activate credits | $1,000 for eligible self-funded founders; much more through provider-backed tiers | Strong AI SDK ecosystem and broad model choice | Search remains separate | Credits expire and require AWS setup; no permanent free inference baseline | 8.0/10 if eligible |

### OpenRouter details

OpenRouter's official AI SDK integration uses `createOpenRouter()` and returns an AI SDK `LanguageModel`. Version 3.0.0 specifically supports AI SDK v7 and Node 22, matching this repository's installed runtime and AI SDK major version.

The free-model router, `openrouter/free`, chooses an available free model at random. That is convenient for experiments but weak for an autonomous CRM agent because model behavior and latency can change between turns. Prefer a pinned tool-capable `:free` model, validate its context window, and expose a deliberate fallback list.

Free-model API limits are 50 requests/day unless the account has purchased at least $10 of credits, in which case the documented free-model allowance rises to 1,000 requests/day. An Eve task can use multiple model calls, so 50 requests is materially fewer than 50 completed research tasks.

OpenRouter does not store prompt/response content by default, but the selected upstream provider may retain or train on it. Production routing should reject providers that do not meet the CRM's data policy rather than relying on an unconstrained free router.

Sources: [OpenRouter pricing](https://openrouter.ai/pricing), [free-model limits](https://openrouter.ai/docs/faq), [free variants](https://openrouter.ai/docs/guides/routing/model-variants/free), [AI SDK integration](https://openrouter.ai/docs/guides/community/vercel-ai-sdk), [AI SDK provider v3 changelog](https://github.com/OpenRouterTeam/ai-sdk-provider/blob/main/CHANGELOG.md), [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection).

## Research replacement comparison

| Search backend | Free allowance | Citation and filtering fit | Recommendation |
| --- | --- | --- | --- |
| Tavily direct | 1,000 API credits/month, no card | Agent-oriented results; implement citations and domain filters in the shared adapter | Best recurring-free default |
| Brave Search direct | $5 recurring monthly credit, equivalent to about 1,000 Search requests at current pricing; card required | Independent index, URLs/snippets/news, strong privacy posture | Best fallback or alternative index |
| Firecrawl through OpenRouter | 10,000 introductory credits expiring after 3 months | OpenRouter creates the linked account; search plus scraped highlights; domain filtering | Best temporary one-key bridge, not a recurring-free plan |
| OpenRouter Parallel engine | No free search allowance documented; $0.001/request | Citations and domain filtering through the OpenRouter server tool | Cheapest metered OpenRouter-native search |
| OpenRouter Exa engine | No free search allowance documented; $0.005/request | Rich highlights, citations, and domain filtering | Higher-context metered option |

OpenRouter can replace Perplexity for research. Its current server tool is `openrouter:web_search`; the older `:online` and web-plugin approaches are deprecated. The server tool can use native provider search, Exa, Firecrawl, Parallel, or Perplexity and returns URL citations. Search cost is additional to model tokens: Parallel is currently $0.001/request, Exa and Perplexity are $0.005/request, and Firecrawl consumes the linked Firecrawl credits.

For an actually recurring-free design, use OpenRouter for synthesis and Tavily or Brave for retrieval. This also keeps `research_person`, LinkedIn candidate discovery, and social discovery deterministic: the application chooses the query, domain filters, result count, and citation normalization instead of asking a model whether it feels like searching.

Sources: [OpenRouter web-search server tool and pricing](https://openrouter.ai/docs/guides/features/server-tools/web-search), [Tavily credits](https://docs.tavily.com/documentation/api-credits), [Brave Search API pricing](https://brave.com/search/api/), [Firecrawl pricing](https://www.firecrawl.dev/pricing).

## Startup credits worth applying for

| Program | Current offer | Relevant eligibility or constraint | Priority |
| --- | --- | --- | --- |
| Google for Startups Cloud Program | Up to $350,000 in Google Cloud credits for qualifying AI startups; Scale-tier perk currently includes $1,000 OpenRouter credits valid for six months and zero OpenRouter processing fees for 12 months | AI program targets qualifying VC-funded pre-seed through Series A startups; OpenRouter perk is marked Scale-tier exclusive | Apply first if funded/eligible |
| AWS Activate | Self-funded founders start at $1,000 and may receive up to $5,000; provider-backed startups may receive up to $200,000 | Pre-Series B, company website, founded within 10 years; larger tier needs an investor/accelerator Org ID | Apply even if bootstrapped |
| Microsoft for Startups | Azure startup credits after acceptance; $2,500 OpenAI credits are listed as a benefit | Privately held software company, pre-Series C, not an agency/consultancy; Azure OpenAI can consume Azure credits | Strong secondary application |
| Together AI Startup Accelerator | Selection-based platform credits plus engineering and go-to-market support | Cohort/selection based; credit amount is not publicly committed | Apply opportunistically |
| Fireworks AI for Startups | Build credits and startup support; public amount is not stated | Application based | Apply opportunistically |
| AMD AI Developer Program | $50 in Fireworks AI credits, valid for 90 days | Short-lived developer promotion | Easy experimental credit |

AWS Activate credits now apply to third-party Bedrock models including Anthropic, Meta, Mistral, and others. That makes AWS the most flexible large-credit fallback if the startup qualifies. Google Cloud's main credits cover Gemini and Gemma, while its separate current perk is the unusually relevant route to $1,000 of OpenRouter usage.

Sources: [Google AI startup program](https://cloud.google.com/startup/ai), [Google startup perks](https://cloud.google.com/startup/perks), [AWS Activate credits](https://aws.amazon.com/startups/credits/), [AWS credits for Bedrock models](https://aws.amazon.com/aws-startups/learn/aws-activate-credits-now-accepted-for-third-party-models-on-amazon-bedrock/), [Microsoft eligibility](https://learn.microsoft.com/en-us/azure/signups/startup-help), [Microsoft AI benefits](https://learn.microsoft.com/en-us/startups/benefits/azure-for-startups), [Together accelerator](https://www.together.ai/blog/announcing-together-ai-startup-accelerator), [Fireworks startups](https://fireworks.ai/startups), [AMD Fireworks credits](https://fireworks.ai/partners/amd).

## Grounded implementation outline

1. Introduce an optional provider registry in `apps/agent` that returns a real AI SDK `LanguageModel`. Add `OPENROUTER_API_KEY` to the root `.env.example` and the agent capability map.
2. Resolve dynamic OpenRouter model objects at Eve's `step.started` lifecycle event. The installed Eve docs only permit string model IDs at session/turn selection, while live `LanguageModel` objects are supported at step selection.
3. Replace the Gateway-only model catalog with an OpenRouter catalog adapter and persist provider-qualified settings. Keep a safe static fallback if catalog lookup fails.
4. Replace `lib/perplexity.ts` with a provider-neutral research interface that returns normalized text, URLs, titles, and citations. Migrate person research, LinkedIn discovery, and social discovery together.
5. Add an Eve `web_search` override that uses the same research adapter. This avoids a mismatch where explicit research uses one backend while general Eve research silently loses search capability.
6. Add per-task search and model-call budgets, 429 handling, capability reporting, and tests for missing keys. A missing optional provider must continue to remove the capability without crashing the install.
7. Canary with a pinned OpenRouter free model and Tavily. Verify tool calling, structured output, citations, long-context behavior, and the three existing research flows before changing the default.

## Decision

Yes: retain AI SDK and Eve, replace AI Gateway with OpenRouter, and replace Perplexity.

The recommended zero-dollar configuration is **OpenRouter free inference plus Tavily free retrieval**, not OpenRouter-only research. OpenRouter-only is also supported and simpler operationally, but its web search is metered and the free inference limit is too small and variable to promise reliable production sales automation.
