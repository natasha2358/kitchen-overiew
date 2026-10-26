# Roadmap

Status: M8, L1 and L2 are authorized; automated tests have resumed. M8 release gates remain open. See [Implementation status](IMPLEMENTATION_STATUS.md) for mapping to this roadmap and measured exit gates.
Related: [PRD](PRD.md), [Architecture](ARCHITECTURE.md), [Contributor instructions](../AGENTS.md).

Work in the order below. Split each milestone into reviewable changes that can be verified independently. Do not advance past an exit gate with unresolved data integrity or authorization failures.

## M1: Documentation agreement and receipt fixtures

Dependencies: none. Requirements: PRD-04 and the agreed MVP scope.

Deliver:
- Review the four baseline documents and record accepted assumptions.
- Select the initial supermarkets, receipt languages, and digital/scanned variants.
- Obtain sanitized PDFs and expected line annotations for normal purchases, weighted goods, multipacks, discounts, decimal conventions, and ambiguous labels.
- Create a fixture coverage matrix including digital PDFs with usable embedded text, scanned/image-only PDFs, and PDFs with empty, garbled, or incomplete text; establish the provisional 10 MiB/10-page processing envelope.

Verify: fixtures contain no unnecessary personal data; each format has expected grocery lines, quantities, units, and explicit uncertainty cases. Identify parser/runtime feasibility risks and annotate expected text or vision-fallback cases without selecting a final parser or building a generalized ingestion platform.

Exit: documentation is agreed and a representative fixture set defines exactly what receipt support means. This documentation task does not itself provide real supermarket fixtures or claim M1 complete.

## M2: Application foundation, authentication, and household isolation

Dependencies: M1. Requirements: PRD-01, PRD-09.

Deliver in small increments:
- Initialize Expo Router and strict TypeScript with feature boundaries, TanStack Query, pinned compatible dependencies, and GitHub CI for lint/type/test checks.
- Create versioned Supabase migrations for household ownership and membership, generated types, and isolated test configuration.
- Implement email/password account flows, retry-safe household bootstrap, default locations, and session/cache cleanup.

Verify: sign-up, verification, sign-in, recovery, and sign-out; repeated bootstrap; two accounts denied access to each other's records; invalid sessions; Android startup and navigation.

Exit: an Android user can authenticate into exactly one private household; isolation tests pass before feature data is added.

## M3: Manual inventory and quantity handling

Dependencies: M2. Requirements: PRD-02, PRD-03, PRD-09.

Deliver in small increments:
- Products with normalized names and optional confirmed aliases, locations, batches, stock movements, and idempotent inventory-operation migrations; no product taxonomy.
- Decimal-safe quantity/package utilities with compatible-unit validation.
- Inventory list/detail and manual add, adjust, waste, move, expiry, and location flows.

Verify: two 500 g packages become 1,000 g; deducting 250 g leaves 750 g; kg/g and l/ml conversion; whitespace/case-normalized name and alias matching; ambiguous matches requiring review; invalid dimensions and missing package sizes; no negative balances; zero-stock history; timezone-based expiry; repeated and concurrent adjustments.

Exit: manual stock is usable on Android and every balance change has an atomic, authorized movement record.

## M4: PDF upload, extraction, and editable drafts

Dependencies: M3 and M1 fixtures. Requirements: PRD-04, draft portion of PRD-05, recovery portion of PRD-06, PRD-09.

Deliver in small increments:
- Private upload flow, source-file validation, server hashing, and canonical import identity.
- Authenticated extraction function preferring server-side embedded-text extraction followed by AI interpretation/normalization, with PDF vision fallback. Select the parser, model/prompt, text-usability checks, and routing exceptions from real fixture evidence.
- Shared validated draft contracts, route/reason metadata, bounded retry/fallback budget, and status recovery for both routes.
- Source-versus-normalized review UI with editable lines, product matches, locations, optional expiry, and revision-protected draft saves.

Verify: Android document picker/cancel; usable-text fixtures taking the text route without PDF vision; scanned/empty/garbled/incomplete-text fixtures taking fallback; both routes producing the same reviewable contract; exhausted shared call/time budget; confirmed aliases proposed without automatic ambiguous merges; unsupported/opening-password-protected/oversize PDFs; Storage isolation; missing and ambiguous quantities; malformed/refused/incomplete AI responses; timeouts, expired processing leases, and late completions; preserved edits after reopening; duplicate uploads resolving to the same draft.

Exit: supported fixtures become reviewable drafts with correct or flagged grocery lines; inventory is unchanged by every upload/extraction/review path. Each fixture has a recorded route and fallback reason if applicable. Actual line/field quality, latency, and cost measurements support the stated format coverage and chosen routing rules; do not lock the approach before this evidence exists.

## M5: Atomic receipt confirmation and duplicate protection

Implementation checkpoint: migration 005 and client/server flows are present. Exit verification is pending; see Implementation status.

Dependencies: M4. Requirements: confirmation portion of PRD-05, PRD-06.

Deliver in small increments:
- Confirmation RPC validating reviewed revisions, included lines, and same-household references.
- Possible-duplicate comparison and acknowledgement flow.
- Transactional product/batch/movement creation, stored confirmation result, and PDF deletion that preserves import identity.

Verify: invalid line rolls back an entire receipt; same PDF submitted concurrently; different operation IDs confirming one import; lost-response retries; stale review rejection; different PDF bytes with matching receipt metadata; legitimate duplicate-warning override; deleted PDF reimport; unauthorized cross-household IDs.

Exit: an import changes stock once at most, confirmation is all-or-nothing, and the UI reconciles ambiguous network outcomes without applying stock twice.

## M6: Preference-aware meal suggestions

Implementation checkpoint: migration 006, authenticated generation and Recipes UI are present. Model configuration, quality evaluation and exit verification remain pending.

Dependencies: M3; schedule after M5 to complete the receipt-to-stock path first. Requirements: PRD-07, PRD-09.

Deliver in small increments:
- Preference and validated suggestion persistence; an optional household-scoped always_available product flag defaulting to false, editable without creating a stock batch or movement.
- Server-side generation from current stock/preferences and explicit staple designations using configurable, fixture-evaluated model/prompt settings.
- Suggestion display with servings, ingredients, steps, measured shortages, labeled staple assumptions, and unresolved mappings; flag changed assumptions when re-evaluating a saved suggestion.

Verify: malformed output; invented product references; invalid quantities/units; known excluded-ingredient conflicts; empty inventory; zero-stock salt with its designation off/on/off showing shortage/assumption/shortage; no stock changes from toggles; finite quantities; a designated but excluded staple rejected; missing unflagged staples; past-date batch exclusion; near-expiry prioritization; changed preferences on a fresh request; request failure and rate limits. Confirm generation never changes balances.

Exit: every suggested ingredient has a measured availability result, a labeled designated-staple assumption, or a visible shortage/unresolved mapping. Known preference conflicts are rejected and no generation or designation change modifies stock.

## M7: Atomic cooking confirmation

Implementation checkpoint: migrations 007–008, cooking review and history are present. Database atomicity/concurrency checks now pass; Android exit verification remains pending.

Dependencies: M6. Requirements: PRD-08.

Deliver in small increments:
- Deterministic batch allocation and review of actual quantities.
- Explicit marking of ingredients or finite remainders used outside tracked inventory, including designated staples; no automatic deduction exemption or unlimited stock.
- Cooking confirmation RPC, stock movements, idempotent response reconciliation, and updated UI balances/history.

Verify: partial batch use; allocation across batches; expiry ordering; unknown conversions; stale stock affecting a proposal; insufficient stock despite a staple designation; 15 ml oil use split into 10 ml tracked plus an explicitly confirmed 5 ml untracked, leaving zero and a -10 ml movement; untracked salt producing no stock movement; two simultaneous cooking events; repeated submission of one event; cooking a recipe again with a new event ID; injected failure rolling back all deductions.

Exit: cooking changes stock only after explicit confirmation, never goes negative, and never partially deducts or repeats one event.

## M8: Android MVP validation and release readiness

Checkpoint: account erasure is implemented with local database concurrency and real Auth/Storage handler evidence. Automated client/database/Auth checks passed; real cloud Edge integration now passes with a documented compatibility bootstrap; deployed-runtime and other release gates remain open. See [Release readiness](RELEASE_READINESS.md).

Dependencies: M1-M7. Requirements: PRD-01 through PRD-09.

Deliver:
- Run the complete Android journey from sign-in and PDF selection through duplicate rejection, meal suggestion, and cooking confirmation; include text/vision-fallback receipts and designated-staple suggestions with actual tracked/untracked usage.
- Finish accessible loading, empty, offline, validation, and recoverable failure states.
- Validate staging migrations, secret handling, private file retention/deletion, and full account deletion across Auth/database/Storage.
- Configure minimal operational visibility for processing failures, latency, usage, rate limits, and duplicate/conflict events without sensitive payload logging.
- Record the chosen model, dependency versions, supported receipt formats, known limitations, and release verification results.

Verify: real Android device; intermittent connectivity and lost responses; sign-out/account switching without cached data leakage; all RLS/Storage/RPC denial cases; fixture regression evaluation; no client-side secrets; account deletion and migration rehearsal.

Exit: every MVP acceptance criterion has passing evidence, no unresolved stock-integrity/security defect remains, and the Android release is ready for a separately authorized distribution action.

## Later phases

| Phase | Capability | Prerequisite and verification |
| --- | --- | --- |
| L1 | Shopping lists — implemented | Migration 009, manual/edit/complete/remove/restore and explicit recipe shortages; database isolation/retry/no-stock-change checks passed |
| L2 | Weekly planning — implemented | Migration 010, weekly schedule/servings/reschedule/cancel and atomic cooking linkage; calendar/scaling/isolation/rollback/concurrency checks pass |
| L3 | Shared households | Membership/invitation authorization, roles, cache invalidation, and multi-user concurrency tests |
| L4 | iOS release validation | Physical-device checks for picking PDFs, authentication, secure sessions, navigation, and both confirmations |

Automatic Gmail integration, offline editing, and wider receipt coverage remain separate scope decisions, not implicit follow-ons.

## Test and evidence map

| Test layer | Essential cases | Milestones |
| --- | --- | --- |
| Domain unit tests | Decimal arithmetic, basic unit/package conversion, invalid dimensions, name/alias matching and ambiguity, expiry ordering, allocation, staple assumptions | M3, M6, M7 |
| Database integration | Same-household references, RLS, guarded RPC access, idempotency, concurrent writes, rollback, insufficient stock | M2, M3, M5, M7 |
| Storage/Edge integration | Private access, invalid files, authentication, bounded retries, stale-attempt rejection, deletion recovery | M4, M5 |
| Mocked AI contract tests | Text/fallback routing, shared call budget, consistent draft contracts, invalid shape, refusal, truncation, ambiguous quantities, invented IDs, preference conflicts, staple assumptions | M4, M6 |
| Sanitized fixture evaluation | Per-format field/line accuracy, uncertainty handling, latency and supported input envelope | M1, M4, M6, M8 |
| Android acceptance | Text/fallback receipt selection -> review -> confirmation -> duplicate attempt -> staple-aware suggestion -> cooking -> verified finite balances | M8 |

Routine CI must not depend on paid live AI calls. Run explicit live evaluations when selecting/changing a model or prompt and before claiming receipt support. Report tests actually executed, skipped checks, and known limitations at each milestone.

M4 follow-through (2026-10-25): one private German REWE eBon supplied; fictional layout/protection regressions added. Initial embedded-text extraction preserves all priced source labels in this sample. Interpretation and lease/retry orchestration are now implemented behind server model configuration, with mocked real-backend and Edge-worker evidence. Scanned fixtures and measured live AI quality remain open. M8 cloud runtime networking is unblocked by locally bundled dependencies and ES256 verification, with real gateway and service checks passing; this is not hosted deployment/device evidence.

M4 integration checkpoint: migrations 014–015, Responses text/PDF routing, reserved call budgets, stale-result protection, proposal review UI and source-order coverage are implemented. Mocked provider tests cover the full upload → proposal → reviewed stock confirmation journey in real Edge workers. M4/M8 exit gates still require live model/fixture accuracy, latency/cost and physical Android evidence.

UI refinement: compact shared components and Kitchen list/detail editing are implemented. Apply selectors and grouped actions to other workflows, then verify exports and UI regressions. Physical Android/TalkBack and browser acceptance remain release gates.
