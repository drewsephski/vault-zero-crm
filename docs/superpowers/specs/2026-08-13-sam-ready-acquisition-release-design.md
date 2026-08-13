# Sam-ready acquisition release

## Objective

Make acquisition mode coherent, trustworthy, and ready for an authenticated Sam demo. The release should make the product answer three questions quickly: which targets deserve attention, why they fit the buy box, and what human decision comes next.

The release includes production database migration, Vercel deployment, and live authenticated verification. Deployment readiness, provider acceptance, and successful user-flow proof remain separate claims.

## Governing invariant

> A company can exist without being a target, but every target must have an acquisition-target record. Acquisition-mode target views and metrics are derived from that record, never inferred from the company's existence.

This invariant applies to list queries, dashboard aggregation, mutations, navigation, and tests.

## Scope

1. Correct target semantics across acquisition lists and dashboard metrics.
2. Make target creation and promotion explicit, idempotent, and concurrency-safe.
3. Add a deterministic, evidence-linked buy-box evaluation to the dossier.
4. Preserve the last successful dossier throughout refresh, retry, and failure states.
5. Standardize acquisition discovery at ten candidates.
6. Improve acquisition terminology, lifecycle visibility, blockers, and empty states.
7. Verify the complete flow locally and in the deployed authenticated product.

## Non-goals

- Replacing `Deal` with a new `AcquisitionOpportunity` model.
- Migrating transaction execution to acquisition-native deal stages.
- Adding historical versions for every evidence claim.
- Adding an ordinary destructive "Remove from targets" action.
- Renaming compatibility routes such as `/companies` or `/deals`.

Acquisition-native opportunity stages and evidence history belong in a later architecture cycle. This release keeps the existing route and model compatibility while presenting acquisition-native language.

## Target inventory and lifecycle

In acquisition mode, the Targets index reads only companies with an `AcquisitionTarget`. It defaults to active targets and excludes `REJECTED` and `ACQUIRED`. Rejected and acquired targets remain available through explicit lifecycle filters so research and history are preserved.

The index gives lifecycle equal scanning weight to fit. At minimum, each row exposes fit, lifecycle stage, research freshness, and recommended next action. Generic companies created by email, calendar, or sales workflows remain fully usable as companies but do not appear in target lists or acquisition metrics.

The normal way to stop pursuing a target is to move it to `REJECTED`. Removing the target relationship is an exceptional administrative operation and is not part of this release.

### Creating and promoting targets

Acquisition-mode manual creation is one API operation that creates the `Company` and `AcquisitionTarget` together. Promoting an existing company is an explicit `Add to targets` operation. Both operations:

- converge on one target under repeated or concurrent requests;
- keep existing company data intact;
- start at `DISCOVERED` when research cannot be queued;
- start at `RESEARCHING` when research is queued;
- return whether research was queued and, if not, the exact blocker.

Research queues automatically when the company has a domain and the saved buy box has at least one preferred industry or geography. Missing prerequisites do not roll back a successfully created target. The response identifies the missing domain or buy-box focus and the UI links to the corrective action.

Candidate approval continues through the existing idempotent review flow and uses the same target and research-queue invariants.

## Dashboard semantics

Every dashboard value named target queries `AcquisitionTarget` directly and scopes through its related company owner.

- **Buy-box fit** counts targets with a successful `STRONG` or `POTENTIAL` assessment.
- **Needs research** counts targets with no successful dossier.
- **Stale targets** counts targets whose last successful dossier is older than the configured stale window.
- **Active Eve work** counts acquisition discovery and dossier work, not unrelated portrait, brand, or contact tasks.

Generic company enrichment does not make a target researched and does not make acquisition research incomplete. The two workflows remain separate.

Shared query helpers define active, rejected, and acquired target scopes so screens do not recreate lifecycle rules independently.

## Deterministic buy-box criteria

The saved buy box produces a deterministic ordered set of criterion IDs. Eve never supplies criterion names as identity.

| Criterion ID | Included when |
| --- | --- |
| `industry` | Preferred industries are configured |
| `geography` | Geographies are configured |
| `excluded-categories` | Exclusions are configured |
| `revenue` | Either revenue bound is configured |
| `ebitda` | Either EBITDA bound is configured |
| `purchase-price` | Either purchase-price bound is configured |
| `owner-involvement` | An owner-involvement preference is configured |
| `recurring-revenue` | A recurring-revenue preference is configured |
| `customer-concentration` | A maximum concentration is configured |
| `asset-profile` | An asset preference is configured |
| `financing` | Financing assumptions are configured |

Each submitted assessment contains:

- the stable criterion ID;
- `MATCH`, `PARTIAL`, `CONCERN`, or `UNKNOWN`;
- a short explanation;
- whether an unknown blocks qualification;
- zero or more source references.

`MATCH`, `PARTIAL`, and `CONCERN` require source evidence. `UNKNOWN` may have no evidence and must never be converted into a negative conclusion. Only an `UNKNOWN` result may set the qualification-blocking flag.

Before any acquisition assessment field is written, the agent tool compares the ordered expected IDs with the submitted IDs. Missing, duplicate, reordered, or invented criteria reject the complete write with actionable feedback. No summary, fit, finding, criterion, recommendation, timestamp, or activity entry is partially persisted.

The database stores criteria as structured JSON on `AcquisitionTarget`. Existing targets migrate with an empty list and remain valid until their next successful refresh.

## Last-known-good dossier semantics

The dossier is a validated snapshot. `researchedAt` means the time the last complete valid dossier committed, never the time a task was queued or started.

Acquisition research state is reported separately:

- `queued`: an active task has not started;
- `running`: an active task has started;
- `retrying`: the task failed but has attempts remaining;
- `failed`: the latest task exhausted retries;
- `idle`: no active or failed refresh needs attention.

`AgentTask` records retain the last failure reason separately from a successful outcome. A failure never clears or edits `AcquisitionTarget` assessment fields. A subsequent valid write replaces the dossier atomically and advances `researchedAt` in the same transaction.

The required failure transition is:

`dossier A` → queued → running → retrying or failed → dossier A still visible with retry → valid dossier B commits → `researchedAt` advances and dossier B renders.

The API returns both the current dossier and the latest acquisition research state so the UI never infers freshness from generic enrichment state.

## Concurrency and idempotency

Database constraints provide the final concurrency boundary:

- `AcquisitionTarget.companyId` remains the unique target identity.
- `AcquisitionCandidate.companyId` and `Company.domain` continue to prevent duplicate attachment and entities.
- A database-level active-task uniqueness constraint permits only one unfinished task for a given task kind and subject.

Application writes use upsert or conflict recovery around those constraints. Sequential preflight reads improve messages but are not treated as concurrency protection. Concurrent target promotion, candidate approval, or research refresh requests converge on the same target and active research task.

## Target dossier experience

Opening a real target defaults to the Acquisition tab. Opening a non-target company from another context keeps Overview first and offers `Add to targets` rather than rendering a fictional `DISCOVERED` state.

The primary decision block places the fit result directly with the buy-box matrix. It then shows:

1. Last successful research time and separate current refresh state.
2. Criterion result, explanation, evidence, and qualification blocker.
3. Assessment summary.
4. Evidence-linked strengths and concerns.
5. Decision-blocking unknowns before other missing information.
6. Recommended next action.
7. Human-controlled lifecycle stage.

Lifecycle controls use a subtle `Manually controlled` tooltip. Eve may recommend a stage but never changes it.

Empty and failure states always identify the next action:

- `Add a domain` when research has no website boundary;
- `Complete the buy box` when discovery focus is missing;
- `Research target` when prerequisites are ready;
- queued, running, or retrying status while work continues;
- `Retry research` with a calm failure explanation after exhaustion.

The current dossier remains visible beneath every non-idle refresh state.

## Terminology and route compatibility

Acquisition surfaces use Targets, Opportunities, Timeline, and Eve. Visible headings, navigation, table labels, record tabs, empty states, and practical page titles follow the workspace vocabulary.

Routes remain `/companies` and `/deals` for compatibility. The route choice is intentional and must not leak generic terminology into the acquisition UI.

## Discovery limit

Ten is the only discovery batch limit. Eve's instructions, tool input schema, user-facing prompts, and tests all use 1–10 candidates. A larger submission is rejected before any candidate is written.

## Test strategy

Implementation follows red-green-refactor. Required coverage includes:

### API and database

- Target metrics exclude non-target companies.
- Owner-scoped metrics scope through the target's company.
- Needs-research ignores generic company-enrichment state.
- Active target views exclude rejected and acquired records while historical filters retain them.
- Generic company lists remain compatible in sales mode.
- Manual target creation and existing-company promotion preserve company data.
- Repeated and concurrent promotion converges on one target.
- Repeated and concurrent refresh requests converge on one active task.
- Candidate approval remains idempotent under concurrency.

### Agent

- Ten candidates validate and eleven fail before execution.
- Expected criterion IDs are deterministic for every configured buy-box field.
- Missing, duplicate, reordered, or invented criterion IDs reject the complete dossier.
- Supported results require evidence; unknowns may remain unsourced.
- Invalid refresh output leaves the prior target and timestamp unchanged.
- A valid replacement writes every dossier field, activity entry, and timestamp atomically.

### Product compatibility and failure path

- A non-target company created through generic CRM flows stays usable, stays out of Targets and acquisition metrics, and can be promoted without duplication or data loss.
- Dossier A remains rendered while refresh is queued, running, retrying, and failed.
- Failure exposes retry without changing `researchedAt`.
- Successful retry commits dossier B and advances `researchedAt` only with that commit.
- Real targets default to Acquisition; non-target companies default to Overview.
- Lifecycle, criterion blockers, terminology, and prerequisite actions render correctly.

## Verification and deployment

Run focused API, agent, and app tests after each change, followed by:

1. `bun run lint`
2. `bun run check-types`
3. `bun run test`
4. `bun run build`
5. `git diff --check`

Before deployment, inspect the current Vercel linkage, production environment presence, migration status, and affected project boundaries without printing secrets.

Deploy in dependency order:

1. Apply the production database migration.
2. Deploy the Eve agent service.
3. Deploy the API service.
4. Deploy the Next.js app.

Live authenticated verification covers:

1. Configure or confirm a valid buy box.
2. Run discovery and confirm no more than ten review candidates.
3. Approve or manually add a target.
4. Confirm only real targets appear in Targets and metrics.
5. Open the target directly into the dossier.
6. Confirm fit, criterion reasoning, evidence, unknown blockers, and lifecycle.
7. Start a refresh and confirm the prior dossier and successful timestamp remain visible.
8. Confirm queued or running state and eventual successful replacement or truthful failure state.
9. Verify a lifecycle change and next action.
10. Check desktop and narrow-width rendering, terminology, empty states, and recovery actions.

The release report states separately whether repository checks passed, Vercel accepted each deployment, research providers completed work, and the authenticated golden path succeeded.
