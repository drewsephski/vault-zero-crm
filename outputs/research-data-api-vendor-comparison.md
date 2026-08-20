# Research Data API Vendor Comparison

Research date: August 20, 2026
Use case: Improve Vault Zero CRM person, company, employment, and public-web research while preserving source provenance and controlling per-research cost.
Budget: Not specified; recommendation favors a low-volume validation tier before any recurring commitment.
Team size: Small product/engineering team.

## Executive Recommendation

- Best overall addition: Crustdata — its low-cost indexed search plus selective person/company enrichment matches the CRM's search-first, verify-second architecture.
- Best budget option: People Data Labs — 100 free records per month is enough for a bounded data-quality evaluation without another subscription.
- Best later-stage workforce intelligence option: Coresignal — strongest fit when company headcount, jobs, hiring trends, and larger-scale datasets become core product features.
- Highest-risk option: DIY or marketplace LinkedIn scrapers — inexpensive per result, but operationally brittle and contrary to LinkedIn's published restrictions on unauthorized automated crawling.
- Keep the current AnySearch + Tavily layer. It already runs both providers concurrently for deep research and merges duplicate URLs with provider attribution.

## Comparison Table

| Vendor | Pricing | Core fit | Integrations | Support and risk | Overall score |
| --- | --- | --- | --- | --- | --- |
| Crustdata | Credit-based; indexed person search is 0.03 credits/result and base person enrichment is 1 credit | Excellent search-then-enrich fit; person, company, job and live web endpoints | Conventional bearer-token REST API | Clear endpoint accounting; live person endpoints are plan-gated and flat-file freshness must not be confused with live API freshness | 8.8/10 |
| People Data Labs | Free up to 100 records/month; Pro starts at $98/month for 350 records | Strong broad person/company enrichment and matching; less oriented around live page scraping | Mature REST APIs and playground | Established vendor and documented security posture; dataset freshness should be validated on Vault Zero examples | 8.1/10 |
| Coresignal | Trial credits; subscriptions from $49/month, with published tiers through enterprise scale | Strongest for workforce, jobs, company growth and historical signals | REST APIs, datasets, webhooks on higher tiers | More infrastructure than the current low-volume identity flow needs; credit economics become attractive at scale | 7.9/10 |
| Bright Data LinkedIn Scraper API | Pay per successful record; current public pricing advertises Scraper APIs starting at $0.75 per 1,000 records | Real-time profiles, companies, jobs and posts from a supplied URL or discovery job | Sync/async API, webhooks and cloud delivery | Technically capable, but direct LinkedIn scraping creates material terms, privacy, and schema-stability risk | 6.4/10 |
| Apify LinkedIn Actors | Actor-specific; examples advertise roughly $4 per 1,000 delivered profiles plus platform economics | Cheap experiments and niche post/profile collection | Actor API, datasets, schedules, webhooks and MCP | Marketplace actors vary by maintainer, output contract and uptime; recent community reports describe broken actors and cost-control surprises | 5.8/10 |

Scoring weights: core fit 40%, pricing 25%, integration 20%, and support/operational risk 15%.

## Vendor Detail

### Crustdata

#### Pricing

- Crustdata states that every new account receives free credits and that signup does not require a credit card. The official public pages do not state the free-credit quantity or dollar price per credit; confirm both in the account dashboard or in writing before production use.
- `/person/search`: 0.03 credits per result.
- `/person/enrich`: 1 credit for the base profile, with optional contact/developer add-ons up to 7 credits total.
- `/company/search`: 0.03 credits per result; `/company/enrich`: 2–4 credits depending on requested fields.
- Indexed search is self-serve; live professional-network person endpoints are plan-gated.
- Credits currently expire after six months.

#### Core Features

- Closest replacement for LinkdAPI because it can accept a professional-network profile URL or business email and return identity, current role, work history, education, certifications, skills and social handles.
- Adds company search/enrichment and job search without introducing a separate provider for every entity.
- Its own documentation recommends the same economic pattern Vault Zero needs: cheap search first, selective enrichment second.

#### Limitations

- “Live” person search/enrichment costs more and requires the correct plan.
- Community reports distinguish monthly flat-file updates from live API behavior, so freshness must be benchmarked endpoint by endpoint.

### People Data Labs

#### Pricing

- Free plan: up to 100 monthly records.
- Pro: starts at $98/month for 350 monthly records.
- Annual commitments advertise a 20% saving; premium/contact fields can require paid access or add-ons.

#### Core Features

- Mature person enrichment and company data with broad matching inputs.
- Best low-risk evaluation because the free allowance supports a real comparison corpus.
- Better suited to enrichment and identity matching than live LinkedIn page extraction.

#### Limitations

- The free tier obfuscates email, phone and address fields.
- User sentiment is generally positive for scale and API maturity, but freshness is the recurring concern relative to real-time providers.

### Coresignal

#### Pricing

- New-user trial currently includes 2,000 credits on the pricing page; documentation also describes free search/collect credits with a limited validity window.
- Paid subscriptions start at $49/month and scale by credits and request rate.
- Employee/company records consume more credits than job records; higher tiers add webhooks and multi-source features.

#### Core Features

- Strong employee, company and jobs datasets.
- Valuable for acquisition research: hiring velocity, workforce composition, job growth and historical headcount can become structured dossier evidence.
- Better strategic fit than a pure LinkedIn scraper when Vault Zero expands beyond individual-profile lookup.

#### Limitations

- More expensive and complex than the current low-volume use case.
- Some advanced features are reserved for higher tiers.

### Bright Data LinkedIn Scraper API

#### Pricing

- Charges per successful record; the current pricing page advertises Scraper APIs starting at $0.75 per 1,000 records, with exact pricing dependent on product and plan.
- A work email and account funding may be required beyond trial access.

#### Core Features

- Real-time profile, company, job and post scraping.
- Sync profile collection supports up to 20 URLs; async jobs support larger batches.
- Bright Data manages proxies, CAPTCHAs and parsing.

#### Limitations

- LinkedIn expressly prohibits unauthorized automated crawling and third-party scraping software in its published terms/help pages.
- A recent user report describes incomplete work-experience descriptions and truncated fields, so “real-time” does not guarantee complete extraction.
- This should receive legal/privacy review before becoming a customer-facing dependency.

### Apify LinkedIn Actors

#### Pricing

- Pricing is actor-specific. One current profile actor advertises $0.004 per delivered profile.
- Platform compute, storage or actor-specific event charges can complicate the apparent per-record price.

#### Core Features

- Fastest route to prototype profile, post or people-search collection.
- Useful for a disposable benchmark or internal experiment, not as identity authority.

#### Limitations

- Actors are third-party marketplace code with uneven maintenance and schemas.
- Community reports include broken LinkedIn actors and unexpected budget consumption.
- It retains the same LinkedIn terms/privacy risk as other unauthorized scrapers.

## Recommended Research Architecture

Do not launch three paid providers for every question. Use intent-based staged fan-out:

1. Read CRM evidence first: messages, meetings, signatures, existing records and human-entered fields.
2. Run AnySearch and Tavily concurrently only for deep/current/identity research. Merge by canonical URL and retain provider attribution.
3. If a likely person or company is found, call one structured provider. Trial Crustdata first; use People Data Labs as the benchmark corpus.
4. Call LinkdAPI only if the structured provider is unavailable or a fresh LinkedIn-specific read is necessary.
5. Use Coresignal only for workforce, jobs, hiring or company-growth questions where its differentiated fields matter.
6. Stop after sufficient corroboration. Do not pay three vendors to repeat the same profile.

For a true three-way deep-research mode, run independent sources concurrently behind a shared deadline, but give them distinct jobs:

- Tavily: current news, citations and identity discovery.
- AnySearch: general/vertical web discovery.
- Crustdata or Coresignal: structured person/company/job facts.

The aggregator should deduplicate URLs, normalize fields into observations, preserve each source and observation time, report provider-specific failures, and never let majority vote turn three copied datasets into “verification.” Use per-session cost ceilings and a circuit breaker for quota exhaustion. Parallel execution improves latency; it does not reduce total cost.

## Suggested Rollout

1. Keep the current implementation in production.
2. Create a 25-person and 25-company benchmark with known CRM truth.
3. Test Crustdata and People Data Labs against the same identifiers for match rate, current-employer accuracy, latency, cost per usable result and source traceability.
4. Add one optional provider adapter behind the existing capability system; do not replace LinkdAPI until the benchmark wins.
5. Add a `deep` research policy that permits parallel public search plus one structured enrichment call.
6. Consider Coresignal only when workforce/job signals are promoted into acquisition criteria or dossiers.
7. Avoid implementing a credentialed DIY LinkedIn scraper.

## Sources

### Crustdata

- [Pricing and endpoint credit costs](https://docs.crustdata.com/general/pricing)
- [Data enrichment overview](https://crustdata.com/solutions/data-enrichment)

### People Data Labs

- [Person data pricing](https://www.peopledatalabs.com/pricing/person)
- [Documentation](https://docs.peopledatalabs.com/)
- [G2 reviews](https://www.g2.com/products/people-data-labs/reviews)

### Coresignal

- [Pricing](https://coresignal.com/pricing/)
- [Pricing and subscriptions documentation](https://docs.coresignal.com/introduction/pricing-and-subscriptions)
- [Employee Data API](https://coresignal.com/solutions/employee-data-api/)

### Bright Data

- [LinkedIn Scraper API documentation](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction)
- [Web Scraper API pricing](https://brightdata.com/pricing/web-scraper)
- [Recent profile-completeness report](https://www.reddit.com/r/SaaS/comments/1rqb1xy/linkedin_personal_profile_with_bright_data/)

### Apify

- [Example LinkedIn profile actor and pricing](https://apify.com/themineworks/linkedin-profile-scraper)
- [Community reliability and cost-control discussion](https://www.reddit.com/r/automation/comments/1sgmbyq/reviews_after_getting_into_web_scrape_tools_apify/)

### LinkedIn policy

- [Crawling Terms and Conditions](https://www.linkedin.com/legal/crawling-terms)
- [Prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions)
- [API Terms of Use](https://www.linkedin.com/legal/l/api-terms-of-use)
