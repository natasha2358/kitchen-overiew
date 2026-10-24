# Architecture

Status: architecture baseline. Implementation and verification are tracked in [Implementation status](IMPLEMENTATION_STATUS.md).
Related: [PRD](PRD.md), [Roadmap](ROADMAP.md), [Contributor instructions](../AGENTS.md).

## System and ownership boundaries

Use one React Native application with Expo Router and TypeScript, backed by one Supabase project per environment. Supabase provides PostgreSQL, Authentication, private Storage, and Edge Functions. TanStack Query owns remote state. OpenAI is called only by authenticated server code.

The mobile client reads authorized data through Supabase and sends explicit mutations to database functions or Edge Functions. Edge Functions handle external AI calls and file processing. PostgreSQL owns authorization-sensitive stock invariants and transactions. There is no custom API server, microservice fleet, vector database, or external job queue in the MVP.

| Component | Responsibility |
| --- | --- |
| Expo Router | Navigation and route composition; no embedded business rules |
| Feature modules | Inventory, receipts, meals, preferences, and authentication UI, hooks, validation, and API adapters |
| Shared domain utilities | Quantity conversion, date interpretation, and reusable contracts; independent of UI |
| TanStack Query | Household-scoped query keys, remote drafts, loading/errors, mutation invalidation |
| Supabase Auth | Email/password identity, verification, recovery, sessions |
| PostgreSQL | Household records, draft revisions, batch balances, stock history, idempotency, transactional confirmation |
| Private Storage | Receipt PDFs protected by household access policies |
| Edge Functions | Authenticate requests, validate files and AI output, orchestrate extraction and suggestions |
| OpenAI | Interpret extracted receipt text, normalize lines, process PDFs as a vision fallback, and propose recipes; never receive database mutation tools or credentials |

Planned layout, to be created only during application implementation: thin routes in app/, feature modules in src/features/, reusable UI/domain/integration utilities in src/shared/, and SQL migrations plus Edge Functions under supabase/. Share portable runtime schemas where practical without introducing a monorepo or forcing React Native dependencies into Deno.

Use local form state for unsaved edits. Include household identity in query keys, invalidate affected inventory/import/history queries after a committed mutation, and clear account-specific caches at sign-out. Do not optimistically report stock confirmation before the database responds. A lost response is reconciled using the original operation identifier.

## Conceptual data model

All household-owned rows carry household_id. Use database constraints and same-household composite references to prevent an otherwise authorized row from pointing to another household's product, batch, location, import, or meal. Auth user IDs reference Supabase identities.

| Entity | Important data and relationships |
| --- | --- |
| households | Name, timezone, owner context; created with the initial owner membership atomically |
| household_memberships | Household, user, role; unique membership; MVP provisions one owner and exposes no invitation flow |
| products | Household-local normalized name, quantity dimension/base unit, optional confirmed aliases, always_available flag defaulting to false |
| storage_locations | Household-local name; pantry, fridge, and freezer provisioned initially |
| inventory_batches | Product, location, remaining quantity, base unit, optional expiry, acquisition date, package metadata, optional receipt-line source, revision |
| stock_movements | Immutable signed quantity delta, batch, reason, actor, operation identity, timestamp, receipt/cooking reference when applicable |
| inventory_operations | Household, client-generated idempotency key, operation type, normalized request fingerprint, stored result; unique within the household |
| receipt_imports | Household, uploader, private object path, verified SHA-256, merchant metadata, status, draft revision, processing attempt metadata, extraction route/fallback reason, duplicate warning/acknowledgement, confirmation result |
| receipt_lines | Import, source label/order, proposed and reviewed product, quantity/unit/package data, location, optional expiry, inclusion flag, validation issues |
| food_preferences | Household dietary choices, excluded ingredients, default servings, revision |
| meal_suggestions | Household, validated recipe snapshot, ingredient mappings, serving count, stock/preference/staple snapshot metadata, assumed-availability labels, generation status |
| cooking_confirmations | Household, optional suggestion reference, actual ingredient snapshot, idempotency identity, timestamp, result; movements reference the confirmation |

Use an inventory operation record for idempotency rather than treating a recipe ID as a cooking identifier. A recipe can legitimately be cooked more than once.

Each confirmed receipt line creates a distinct batch; do not automatically merge separate purchases. Partial consumption changes the batch balance and appends movements. Avoid deleting batches with history; exhausted batches remain historical. Product and location deletion must not break references.

### Simple product normalization and pantry staples

A product is a household-local normalized name with optional confirmed aliases and one quantity dimension. Preserve a readable name and original receipt labels. Use whitespace trimming/collapsing and case-insensitive comparison for exact name/alias matching. AI may suggest names and matches, but ambiguous matches require user review; never automatically merge products because their names look similar. A saved alias proposes a match on a later import without bypassing quantity and package review.

Keep aliases with their product for the MVP; no category hierarchy, ingredient ontology, embeddings, or separate matching service is needed. Unit conversion is a separate deterministic concern and must not depend on a taxonomy.

The optional always_available product flag is household-scoped and false by default. It can be set for a product with no batch, so users can designate salt, pepper, individual spices, or oil without creating artificial stock. Updating it is ordinary authorized product metadata, creates no stock movement, and invalidates affected meal queries. Fetch current flags for generation/re-evaluation and label saved suggestions whose assumptions have changed.

This flag is a suggestion assumption only. Actual batches remain the sole source of quantities for allocation and deductions; the flag does not make past-date batches eligible or override dietary exclusions. Avoid introducing a second inventory or a separate staple catalogue.

### Quantities, packages, and dates

- Store quantities as PostgreSQL numeric and represent decimal quantities in transport contracts as decimal strings. Use decimal-safe domain arithmetic; do not rely on binary floating-point for stock accounting.
- Canonical units are g, ml, and item. Accept kg and l for display/input and convert deterministically. Count must represent whole items in the MVP; weighted or volumetric quantities can be fractional.
- A product has one quantity dimension. Changing dimension after stock exists is disallowed; resolve an incorrectly classified product explicitly.
- Packages describe acquisition: two packages of 500 g mean 1,000 g total. The current 750 g balance after consumption is authoritative; acquisition package count does not imply two unopened packages.
- Require a confirmed per-package size to convert package count to mass or volume. Do not invent density-based mass/volume conversion or a weight for an item.
- Omit unresolved receipt quantities until reviewed; never default an unknown purchase quantity to one.
- Store expiry as date and audit events as timestamptz. Provision household timezone from the device's IANA timezone, falling back to UTC; use it consistently for expiry comparisons.
- Expiry is nullable and user-confirmed. For eligible meal stock, known dates sort before unknown dates. Inventory also displays past-date stock; past-date batches are excluded from meal allocation by default.

## Interfaces and mutation rules

The names below are proposed logical interfaces, not existing endpoints. Contracts use runtime validation on the server and strict TypeScript types on the client. Treat client IDs, household IDs, file metadata, and AI references as untrusted.

| Interface | Input | Output and guarantees |
| --- | --- | --- |
| Household bootstrap RPC | Authenticated identity; initial timezone/name | Existing or newly provisioned household; retry-safe single-owner provisioning |
| Inventory mutation RPC | Household, operation ID, action, validated quantities/references, expected batch revision for updates | Recorded operation and resulting balances; adjustment/move/waste/add operations are atomic |
| Receipt upload preparation | Household, operation ID, declared file metadata | Authorized import ID and controlled private object destination; no stock change |
| Receipt extraction Edge Function | Import ID, extraction attempt ID | Canonical import/status and validated draft or structured error; never stock changes |
| Receipt draft-save RPC | Import ID, expected revision, complete edited lines | Validated saved draft and incremented revision; rejects stale or confirmed imports |
| Receipt confirmation RPC | Import ID, reviewed revision, operation ID, warning acknowledgement if required | Stored confirmation result, created batches and movements; one transaction |
| Meal suggestion Edge Function | Household, preferences revision, servings, request ID | Validated suggestions with ingredient mappings, measured shortages, labeled staple assumptions, and snapshot metadata |
| Cooking confirmation RPC | Household, operation ID, suggestion reference if any, actual batch allocations and expected revisions, explicit untracked ingredients | One cooking event with all deductions, or a conflict with no deductions |
| Receipt file deletion Edge Function | Import ID | Deleted/already-absent status; retained hash, import identity, and stock history |

Resolve authenticated identity from verified credentials, never a user ID in the request body. Each interface checks household membership and same-household references. Direct reads and ordinary metadata CRUD use RLS; clients cannot directly edit protected balances, stock movements, operation results, import processing/confirmation state, or membership roles.

For database functions that need elevated privileges to enforce these write boundaries, use narrowly scoped SECURITY DEFINER functions with a fixed safe search_path, fully qualified objects, explicit auth.uid()/membership checks, and restricted EXECUTE grants. Revoke public/anonymous execution and direct table write grants as appropriate. RLS alone does not protect a privileged function that omits authorization.

Inventory transactions lock affected batches in a deterministic order and verify revisions, eligibility, compatible units, and available quantities. The ledger and balance update occur in the same transaction; a balance can never go below zero. Ordinary metadata changes to batch eligibility increment its revision.

Each stock-changing operation has a unique household-scoped idempotency key and a fingerprint of the validated request. A retry with the same key and request returns the stored result; key reuse with different content returns a conflict. Receipt confirmation additionally enforces one confirmation per import, even when callers supply different operation IDs. Lock the receipt and check confirmed status before rejecting a retry solely for an old draft revision.

AI calls and Storage operations happen outside stock transactions. Do not hold database locks while waiting for external services. Neither Storage nor OpenAI is part of a PostgreSQL transaction; reconcile incomplete uploads and file deletions explicitly.

Return recognizable categories such as validation, unauthorized, forbidden, conflict, unsupported-file, retryable-processing-failure, and rate-limit, with safe user messages. Do not leak another household's row existence through detailed errors.

## Receipt import workflow

### 1. Select, upload, and verify

The phone document picker selects a PDF. Client checks improve feedback, but the server verifies content, type, length, household ownership, and the expected object destination before processing. Initial application limits are 10 MiB and 10 pages per receipt; validate parser and Edge Function feasibility with fixtures before promising support. Encrypted or unreadable files fail with an actionable message.

Use a private bucket with paths containing household ID and a server-issued import ID. Uploaded source objects are immutable to the client; replacement uses a new import attempt. The extraction function hashes the actual stored bytes it will process, not a client-declared hash.

Apply a database unique constraint on household plus verified hash for canonical imports. Before verification the hash is nullable. Concurrent equivalent uploads race against this constraint; the loser is marked duplicate and points to the winner rather than creating a second draft. Duplicate attempt rows do not claim the canonical hash. Best-effort cleanup removes redundant objects; failed cleanup is recorded for operational retry.

### 2. Extract a draft

Prefer extracting embedded text from verified digital PDF bytes server-side where practical, then submit that text to the OpenAI Responses API for interpretation and normalization using a constrained output schema. Preserve available line/page context rather than discarding it during text extraction.

Use PDF vision processing as a fallback when there is no embedded text, the text is unreadable or materially incomplete, the layout cannot be interpreted reliably, or practical parser/runtime limitations prevent the text route. A failure to extract text does not by itself mean the PDF is invalid. Choose the parser and text-usability checks from real fixtures; record any format-specific routing exception rather than asserting that all digital PDFs work with text extraction. Do not introduce a standalone OCR service.

When PDF vision fallback is needed, use a compatible model and prefer direct file data within the bounded input envelope rather than a separately retained OpenAI Files object. Both routes share the same draft schema, source labels, validation, review, and confirmation flow. Keep file identity based on the original PDF bytes, never the extracted text.

Record the extraction route and fallback reason with the attempt, without logging receipt contents. Parser choice and routing heuristics remain provisional until fixture evaluations demonstrate coverage, latency, and cost. Configure response storage according to current OpenAI data-control documentation before implementation; do not promise zero provider retention.

Treat receipt text as data, including any embedded instructions. No model tools may mutate inventory. Validate the returned shape, identifiers, quantity semantics, line coverage expectations, and limits using runtime schemas and domain rules. Refusals, incomplete responses, and invalid results are explicit failures.

Preserve source labels and uncertainty markers; proposed normalized names may match household products or remain unresolved. Only user-confirmed matching creates reusable product aliases. An AI confidence value is advisory and never bypasses review.

Use receipt status transitions: uploading -> uploaded -> processing -> review_ready -> confirmed. Failures retain their failed stage; failed extraction can return to processing. duplicate points to a canonical import; discarded abandons an unconfirmed import and preserves identity metadata. Discarded canonical imports can be reopened for review; confirmed ones cannot be reset.

### 3. Recover bounded processing

Process on demand within Edge Functions using a persisted attempt ID and expiring processing lease. Set a deadline below the hosting runtime limit. Allow at most two upstream AI calls in total per explicit attempt, shared between any text-to-vision fallback and transient transport/rate-limit/server retries. Local embedded-text extraction does not consume an AI call. A routing fallback addresses unusable/incomplete source text, not an automatic retry of a refusal or malformed response. Use bounded backoff for transient retries within the deadline; if the shared call/time budget is exhausted, return a recoverable failure rather than starting an unbounded fallback loop.

The client can reopen an import and inspect status after a disconnect. If a lease expires, a new explicit retry may acquire it. Accept completion only from the active attempt ID, so a late response cannot overwrite a newer result. Saving an AI draft is conditional on processing state; it cannot replace review edits or a confirmed import.

Do not add a background queue for MVP. Confirm these limits and recovery behavior in the receipt milestone; use a smaller supported input envelope if representative fixtures exceed runtime limits.

### 4. Review and detect semantic duplicates

Drafts contain source and reviewed values separately. Users can edit, add, match, or exclude lines and assign locations and optional expiry. Draft revision checks prevent one screen from silently overwriting another.

Exact-byte equality is a hard duplicate. Different bytes are only a possible duplicate when normalized merchant plus receipt identifier match, or merchant/date/total/currency suggest the same purchase. Display the existing candidate and require acknowledgement before confirmation; do not claim hashes detect re-rendered receipts. Receipt numbers or totals missing from a document must not be fabricated.

### 5. Confirm atomically

The confirmation RPC locks the import, checks membership and reviewed revision, validates all included lines and warning acknowledgement, resolves reviewed product creation, and creates batches and stock movements. Record the operation result and confirmed status in that same transaction.

Any invalid line or failed insert rolls back all changes. Concurrent confirmations or retries after a lost network response return the existing confirmation. Re-extraction, retrying uploads, and deleting the PDF cannot reapply stock.

### 6. Retain or delete source files

PDFs remain private until the owner deletes them. Delete through the server so object state and metadata can be reconciled; a missing object is an idempotent success. Preserve verified hash, receipt identity, confirmed lines, and stock history after deleting only the PDF. A draft without its source can still be reviewed, but extraction requires uploading the source again. If a newly uploaded file matches a canonical import whose source was deleted, attach the verified replacement source to that canonical import under a lock instead of discarding it. Preserve reviewed edits and confirmed status; replacing a source never authorizes another stock confirmation.

This policy covers source-file deletion, not full account erasure. Production readiness must define and test full account deletion across Auth, database, and Storage.

## Meal suggestions and cooking

Fetch current household inventory, always_available product flags, and preferences server-side; do not trust an arbitrary client inventory snapshot. Supply only necessary product names, measured quantities, eligible expiry information, explicit staple assumptions, and preferences to OpenAI. A flagged product may influence suggestions without any stock batch, but never send an invented or infinite stock quantity.

Validate recipe structure and all mapped product IDs, units, finite positive quantities, servings, and known excluded-ingredient conflicts. Compute measured availability and shortages deterministically after generation, then separately label assumptions for designated staples. Distinguish fully stocked recipes, recipes relying on designated staples, and recipes with other missing ingredients. A flagged but excluded ingredient still conflicts with preferences. Unknown mappings remain unresolved. Store a validated suggestion with its stock/preference/staple snapshot metadata so the UI can explain changes since generation.

Build deduction proposals using earliest known expiry, then unknown expiry, with acquisition time and batch ID as stable tie-breakers. Exclude zero and past-date batches by default. Known excluded ingredients cannot be silently substituted into a recipe.

The user reviews actual ingredients and batch allocations, including designated staples. Resolve ambiguous conversions before confirmation; any amount sourced outside tracked inventory must be explicitly marked untracked, never silently inferred from always_available. An ingredient can have finite tracked allocations and an explicitly confirmed untracked remainder; those amounts must sum to its reviewed actual usage in compatible units. Untracked usage is retained in the cooking snapshot and creates no stock movement.

For example, using 15 ml of oil when only 10 ml is tracked cannot authorize a 15 ml deduction, even if oil is always_available. The user can revise the request to deduct 10 ml and explicitly record 5 ml as untracked. The batch ends at zero with a -10 ml movement. Untracked salt with no batch creates no salt movement. The flag cannot replenish, erase, or bypass deductions from existing batches.

On submission the cooking RPC validates this breakdown, locks selected batches, checks current revisions and availability, and records the event and movements atomically. Stale allocations return a conflict for refreshed review; do not silently reassign batches or partially cook. A suggestion does not reserve stock.

## Security, privacy, and operations

- Enable RLS for all household tables and apply private Storage policies for reads, uploads, and deletions. Household membership lookup policies must avoid recursive RLS evaluation.
- Bootstrap membership through trusted database logic; users cannot grant themselves access to an arbitrary household.
- If an Edge Function uses a privileged Supabase credential, explicitly check identity, membership, and object ownership first. The service role bypasses RLS and is never a substitute for these checks.
- Keep OpenAI and privileged Supabase secrets in server-managed configuration. Only publishable client configuration belongs in Expo. Use platform-appropriate secure session storage.
- Send the minimum relevant data to AI. Never send Auth tokens, database credentials, or unrelated household data. Show the receipt-processing disclosure before the first upload.
- Keep PDFs private, use short-lived signed access only when needed, and avoid logging raw PDFs, AI payloads, preferences, tokens, or signed URLs.
- Rate-limit extraction and suggestion requests per authenticated household and record attempt counts, latency, error category, model/prompt version, and usage without payload contents.
- Version schema changes in PostgreSQL migrations, regenerate client database types, and test policies and functions using realistic authenticated roles.
- Run migrations in a local/test environment before staging, validate fixture processing in staging, and gate production release on the roadmap's acceptance evidence.

## Verification strategy

Use deterministic domain tests for decimals, compatible unit conversion, package multiplication, simple name/alias matching and ambiguity, expiry ordering, allocation, and staple assumptions that never change measured balances. Use real PostgreSQL integration tests for atomic operations, constraints, RLS, idempotency, concurrent retries, rollback, and insufficient stock. Exercise Storage policies and Edge authentication separately.

Mock OpenAI for routine validation, refusal, timeout, and stale-attempt tests. Test usable embedded-text routing, empty/garbled/scanned fallback, equivalent draft contracts, and the shared retry/fallback call budget. Test staple toggles, dietary exclusions, finite quantities, tracked/untracked splits, and unchanged stock for untracked usage. Use sanitized fixture evaluations against a selected model as an explicit quality gate, separate from deterministic CI. Run the complete receipt-to-cooking journey on Android; validate iOS before claiming an iOS release.

## Decision record and references

| Decision | Reason and consequence |
| --- | --- |
| Online-first | Avoid offline conflict resolution; mutations require a connection |
| Household ownership from the start | Future shared use can extend membership without reassigning all records |
| Batch balances plus movements | Supports partial consumption, expiry, and an audit trail without full event sourcing |
| Simple household-local products | Normalized names and optional confirmed aliases; basic compatible conversions without a taxonomy or matching service |
| Embedded text preferred; PDF vision fallback | AI interprets/normalizes text where practical; routing stays flexible until real fixture evidence |
| Optional always-available staples | Explicit, labeled suggestion assumptions; batch quantities still control all stock deductions |
| AI proposes; transactions commit | Human review controls meaning; deterministic code controls stock integrity |
| Exact hash plus possible-duplicate warning | Reliable byte-level protection without false claims about semantic identity |
| On-demand bounded extraction | Keeps the backend simple; supported receipt size must fit runtime limits |
| Configurable model and versioned prompts | Model choice follows fixture evidence; no fixed model is promised here |

Official references verified during planning:

- [OpenAI file/PDF inputs](https://developers.openai.com/api/docs/guides/file-inputs).
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Schema conformance does not establish factual correctness.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Supabase database functions](https://supabase.com/docs/guides/database/functions).
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

### Implemented M5/M6 decisions

Receipt metadata and line edits share one reviewed revision. Confirmation serializes household receipt confirmations while evaluating possible duplicates, then commits line batches and movements together. Source deletion uses a persisted token around the external Storage removal; verified replacement bytes can restore a deleted source without clearing confirmation.

Meal generation uses one household-scoped persisted request with an attempt token and 90-second lease. Each of at most two explicit attempts has a 40-second network deadline and two-call budget; five new requests per ten minutes limits upstream use. Preferences use optimistic revisions. Only the server can complete suggestions, and late results after a preference revision change are rejected. Deterministic availability is recomputed from finite batch quantities, separately from staple assumptions. Prompt `kitchen-meals-v1` and the configured model are retained with each snapshot; real model evaluation is still pending.
