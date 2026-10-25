# Implementation status

Branch: `feat/smart-kitchen-foundation`, pushed to GitHub at the user’s request. No merge, app publication, production deployment, paid infrastructure, or external account modification was performed.

**Automated testing resumed at the user's request on 2026-10-24.** The original four milestones and M5–M7 implementation are present. Runtime verification of authentication, inventory, and receipt flows remains incomplete; do not treat implementation as a verified release.

## Scope and milestone mapping

The assignment's four milestones are foundation, database/authentication, inventory, and receipt import foundation. They map to baseline roadmap M2 (split into two), M3, and the foundation of M4. Baseline M1 real supermarket fixtures remain missing. Synthetic fixtures do not establish supermarket support. Recipes, Shopping, and Planner are navigation destinations with explicit planned-feature states.

## Milestone 1 — application foundation

Implemented Expo SDK 58 / React Native 0.88 / React 19.3, Expo Router, strict TypeScript, shared accessible UI/styles, Kitchen/Recipes/Shopping/Planner tabs, ESLint, Jest/React Native Testing Library, formatting, and CI. The dependency lockfile is committed. Node 24 is the development runtime.

Initial foundation was committed as `957df73`. At that checkpoint lint, typecheck, three Jest tests, Android Hermes/web exports, Metro startup, and an Android development-manifest request passed. The final expanded application has not been exported again after testing was paused. No native APK build, Android emulator/device journey, TalkBack check, or iOS validation has run.

## Milestone 2 — database and authentication

Implemented email/password sign-up and sign-in, PKCE callbacks, email recovery/password update, and sign-out. Native sessions use chunked platform secure storage; web sessions use sessionStorage. Account changes clear query data and remount account-specific forms. Offline mutations are blocked and cached data is labeled potentially stale. Invalid/missing public configuration produces a setup boundary; privileged client keys are rejected.

Migration `202610240001` creates households, protected owner membership, locations, RLS, and a verified-user-only, retry-safe household bootstrap. One owner/household per user is enforced. Default locations are Pantry, Fridge, and Freezer. Types in `src/shared/database.types.ts` were generated from the actual migrated database with Supabase's generator; they were not hand-authored.

Real Auth/email and household isolation test scripts are implemented but **have not run**. No authentication runtime readiness claim is made.

## Milestone 3 — grocery inventory

Implemented list/detail/manual add, storage filters, exhausted-batch history, expiry indicators, product/alias management, and storage-location management. Stock actions include create, add, adjust, waste, move, expiry edit, and removal. Removal exhausts a batch and records a movement; historical batches are never deleted. Unused product/location metadata can be deleted; history references block deletion.

Migration `202610240002` uses numeric quantities, same-household/unit foreign keys, immutable stock-write boundaries, row locks, revision checks, and household-scoped idempotency records. JSON quantity contracts use strings. Decimal-safe client calculations handle compatible unit conversion, packages, totals, and remaining balances. Name/alias matching returns ambiguity instead of guessing.

Pending stock requests retain their exact request and operation ID in household-scoped secure/session storage. A lost response can be reconciled from Kitchen without intentionally creating a second operation. This is not an offline-edit queue.

Database tests are written for authorization, forged references, retries, stale revisions, insufficient stock, exact balances, transaction failure injection, and concurrent requests. These scripts remain **unrun**. Android inventory interaction is unverified.

## Milestone 4 — receipt import foundation

Implemented PDF selection/cancel handling, private upload preparation, server PDF structure/size/page validation, SHA-256 over stored bytes, household-scoped canonical identity, and manual receipt review. Review supports source labels, reviewed names, product matching, quantities/units, locations, optional expiry, exclusion, and adding missing lines. Saves are revision-protected; source labels are preserved. Upload and review SQL never write inventory.

Migration `202610240003` creates receipt/import entities and protected RPCs. Migration `202610240004` creates the private bucket and Storage policies. These four foundation migrations are applied in this cloud instance; migrations 005–008 are also now applied. Starting Storage initialized its schema and unblocked the private bucket/policies migration. Receipt uploads still require the Edge runtime, which is blocked by container DNS in this environment.

`verify-receipt` validates an authenticated user's ownership before downloading the private object or calling the service-role hash-registration RPC. `parse-receipt` authenticates and checks ownership, then explicitly returns `501 PARSING_NOT_CONFIGURED`. No fake extraction is returned. No OpenAI binding or real supermarket fixtures were supplied; simply adding a key does not enable parsing.

Synthetic text and image-only PDFs plus a hand-authored proposal fixture are included. They test structural/contract boundaries only. A genuine encrypted PDF fixture and real supermarket digital/scanned fixtures are still needed. Parser/model choice, line-coverage evaluation, extraction leases, bounded two-call orchestration, timeouts, and late-result protection belong to the future parsing implementation.

M5 now implements confirmation and source deletion (see checkpoint below). Duplicate attempt objects remain private; automatic redundant-object cleanup remains deferred. Native picker behavior and full Storage/Edge integration are unverified.

## Commands and evidence

| Command/check | Observed result |
| --- | --- |
| `npm install` / Expo compatible dependency installation | Completed; committed npm lockfile |
| Initial `npm run check` | Lint/typecheck and 3 foundation tests passed |
| Initial `npm run build` | Android Hermes bundle and web export passed |
| Metro + Android development manifest request | Passed at foundation checkpoint |
| Pre-pause full `npm test` | 7 suites / 31 tests passed at that revision |
| Later auth/config/storage subset | 4 suites / 13 tests passed; includes an additional configuration test |
| `npm run test:edge` | 3 synthetic PDF/proposal tests passed before testing was paused |
| `npm run check:edge` | Both Edge Function entrypoints compiled before the pause |
| Local migrations `001`, `002`, `003` | Applied to real Supabase PostgreSQL |
| Local migration `004` | Applied; migration history lists all four versions; subsequent `migration up --local` reports up to date |
| `npm run db:types` | Generated from the applied public schema |
| Final `npm run typecheck` | Passed after implementation and type generation; compilation only, no tests |
| `npm run test:db`, `test:auth`, `test:services` | Written, never executed |
| Final full tests/export, Android APK/device | Not run; testing paused by user |

Earlier tooling/test failures (read-only caches, async renderer usage, lint configuration, fixture-relative paths) were corrected before their recorded passing runs. These results are revision-specific; there is no final all-green test run.

## Cloud environment limitation

Docker uses `vfs` on a 32 GiB filesystem. The standard PostgreSQL image exhausted disk space while unpacking. A checksum-verified `crane` release exported the official digest-resolved image; its filesystem was imported as one local layer and its runtime configuration matched the source. This enabled PostgreSQL and postgres-meta to start after optional service images were removed. No existing user data was deleted; only this task's failed, uninitialized container and downloaded optional images were removed.

The cloud instance now runs PostgreSQL, metadata, Auth, Storage, REST, gateway and Mailpit. The pinned Storage and Edge images were also flattened. Edge runtime startup failed because its bootstrap dependency `https://deno.land/std/http/status.ts` could not resolve inside the container. The CLI stopped that failed startup; restarting with `edge-runtime` excluded preserved the database and brought the remaining services up. Approximately 1.8 GiB remains free with these services running. Docker Desktop/overlay2 with working container DNS is recommended for the full workflow. No JWT checks, TLS verification or RLS policies were disabled.

## Next steps

1. Review the implementation; keep the current working branch separate from main.
2. On a development computer, start the full Supabase stack, apply all migrations through 008, and serve the Edge Functions. See README for exact commands and Android instructions.
3. Set only the public Supabase URL/anon or publishable key in `.env.local`; configure exact email redirect URLs for the chosen Expo client.
4. When testing is authorized again, run the prepared lint/type/unit, database, Auth/email, Edge, and Storage integration commands. Fix any discovered failures before claiming readiness.
5. Run Android startup/navigation, email callbacks, inventory, picker/cancel, upload recovery, and review on a real device/emulator. Native/API integration remains the main verification gap.
6. Obtain sanitized supermarket fixtures and make a separately evaluated server-side parsing implementation. Keep privileged/model credentials server-side.

## M5 preparation checkpoint

The user reaffirmed the testing pause. No tests were run during this preparation. Receipt review now retains unsaved edits across background refreshes, uses the revision on which edits were based, and offers explicit reload/discard handling. Review feedback now flags invalid values and product/unit dimension mismatches. TypeScript compilation passed during this work; additional tests were written but not executed.

The image-flattening helper now supports the pinned Storage and Edge runtime images as well as PostgreSQL. All three images were prepared. Auth and Storage startup completed, and migration 004 is applied. Edge startup remains blocked by container DNS. See [M5 readiness](M5_READINESS.md) for the remaining gates; M5 was not started at that preparation checkpoint; implementation is recorded below.

The checkpoint was pushed to GitHub at the user's request. The existing workflow had push/PR triggers, so that first push may have queued remote checks; Actions API access is blocked here and the remote outcome is unknown. Automatic workflow triggers have now been replaced with manual `workflow_dispatch` during the user's testing pause. No local test command was run. Restore automatic CI triggers when testing resumes.

## Backend preparation continuation

- Started the available backend with `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io /workspace/tools/supabase start -x studio,imgproxy,logflare,vector,supavisor,realtime,edge-runtime`. This exclusion is a cloud workaround, not a complete receipt backend.
- Ran `supabase migration up --local`: database up to date. Read migration history: versions 202610240001 through 202610240004 are present. One attempt before database startup completed failed with connection refused; retry after startup succeeded.
- Docker reports healthy PostgreSQL, Auth, Storage, gateway, Mailpit and metadata containers; REST is running. These are service startup observations, not application or authorization tests.
- Removed the database test command from README setup steps and explicitly marked checks as paused. No tests were run during this continuation.
- Remaining blockers: Edge container dependency networking, unrun integration/Android checks, and real receipt fixtures/AI parsing. At that checkpoint M5 was future work; it is now implemented as recorded below.

## M5 — atomic receipt confirmation (implementation checkpoint)

Implemented migration 005: authorized receipt locking, reviewed-revision checks, semantic duplicate candidates and explicit candidate acknowledgement, compatible quantity conversion, product resolution, separate line batches, immutable movements and a stored confirmation in one transaction. A receipt returns its prior confirmation even with a new operation ID; reused IDs with different payloads are rejected. Client requests survive lost responses in local secure/session storage. Confirmed reviews are immutable.

Added optional merchant/number/date/total/currency review fields. The ownership-checked source deletion function uses a persisted deletion token, retains canonical hashes and movements, and permits a verified replacement source without reconfirmation. Storage calls remain outside stock transactions.

Applied migration 005 locally and regenerated database types. TypeScript compilation passed. Added transaction/authorization/retry/deletion tests but did not run them; concurrency, Storage integration and Android acceptance remain unverified. Edge runtime networking remains blocked in this cloud. No production deployment.

## M6 — preference-aware meal suggestions (implementation checkpoint)

Implemented migration 006: revision-protected dietary preferences/exclusions/servings, RLS-protected suggestion snapshots, persisted generation leases, two explicit attempts per request, and five new requests per household per ten minutes. Product staple flags are editable without creating balances or movements.

`suggest-meals` fetches fresh household data, excludes expired stock, orders usable batches by expiry, and uses the OpenAI Responses API with structured output, no tools and `store:false`. It requires server-only `OPENAI_API_KEY` and `OPENAI_MEAL_MODEL`; neither is supplied or created. Each attempt permits at most two upstream calls within a 40-second deadline. Refusal, incomplete output, invalid references/units/quantities, repeated mapped ingredients and known exclusion/diet conflicts are rejected. Dietary name checks are conservative common-name checks, not a comprehensive ingredient ontology. Empty compatible results remain explicit.

Recipes shows saved suggestions and recalculates decimal availability, shortages and optional staple assumptions from refreshed data, indicating changed context. Unknown mappings stay unresolved. Preference changes invalidate late generation saves. No AI result writes stock. The UI discloses relevant data sent to OpenAI and supports retrying persisted generation IDs.

Migration 006 applied locally; database types regenerated. Client TypeScript, lint and both new Edge entrypoint compilation passed. Added domain and database isolation/lease tests, not executed. No live model calls, fixture quality evaluation, Android interaction or Edge integration was run. Official OpenAI guide URLs returned HTTP 403 in this cloud; the current Responses request/structured-output types were read from OpenAI's official `openai-node` repository instead: https://github.com/openai/openai-node/blob/master/src/resources/responses/responses.ts . Model selection remains an explicit quality/configuration gate.

## M7 — atomic cooking confirmation (implementation checkpoint)

Implemented migrations 007–008: RLS-protected cooking history, stock movement provenance, and an authenticated confirmation RPC. It serializes operation retries, locks selected batches in deterministic ID order, rechecks household/product/unit/revision/expiry/available quantity, validates current preferences, and writes balances, movements, operation result and cooking snapshot in one transaction. Any invalid ingredient rolls back the entire event.

Actual quantities use canonical g/ml/whole-item units. Tracked allocations plus finite explicitly acknowledged untracked usage must equal actual usage. Staple flags have no role in deduction authorization. Untracked-only ingredients create no movement. Reusing one operation ID replays its result; another intentional cooking event uses a new ID. Cooking requests carry an explicit action to prevent confusion with other stock operation kinds.

The cooking screen proposes earliest-known-expiry batches, then unknown expiry, acquisition time and batch ID; it permits quantity/allocation/product edits and manual meals without a generated recipe. Unresolved ingredients can only be recorded as explicitly untracked. Pending requests survive lost responses and can be reconciled from Recipes; successful confirmations refresh inventory and history. The form keeps one operation ID per review to protect rapid repeated submissions.

Final review also tied receipt duplicate acknowledgement to candidate IDs rather than a general checkbox, so a newly discovered candidate is never implicitly acknowledged. Prepared receipt database tests now encode JSON arrays correctly.

### Evidence and limits

- Local migrations 005, 006, 007 and 008 applied successfully; migration application is not transaction/authorization verification. Database types regenerated from the migrated schema.
- Client TypeScript compilation and ESLint passed at implementation checkpoints. New deletion/suggestion Edge entrypoints compiled with Deno. No tests, live model calls, app export, APK build or device interaction were run during M5–M7.
- Added unrun tests for receipt rollback/idempotency/duplicates/source replacement, meal preferences/isolation/late completion and decimal availability, cooking allocation/split validation/rollback/isolation, and real concurrent confirmation/cooking requests. Existing and new suites must be run before making integrity or readiness claims; their presence does not establish correctness.
- Edge dependency networking, Android validation, realistic receipt fixtures, automatic receipt parsing and model-quality evaluation remain outstanding. Meals require server-only key/model configuration. Shopping/Planner remain future work.
- Milestone commits: M5 `8154040`; M6 `1cc4107`; M7 is the commit containing this checkpoint. No merge, production deployment or publication.

### Next authorized work when testing resumes

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run check:edge`, `npm run test:edge`, `npm run test:db`, `npm run test:auth`, and `npm run test:services` against an isolated local backend, fixing failures before claiming milestone exit gates. Extend Edge integration to generation/refusal/lease and deletion/replacement cases, then exercise the full Android journey. Restore automatic CI only when the testing pause is lifted. Paid model quality evaluation and production publication remain separate authorization decisions.

## M8 — release-readiness checkpoint

Automated tests resumed. Client lint/typecheck and all 42 tests passed; real database isolation, rollback and concurrency suites passed. Auth initially failed due to a harness assumption of HTTP 302; the pinned server returns 303, and accepting both valid redirect codes allowed the complete email recovery suite to pass. Edge structural/proposal tests passed. Added safe operational telemetry and a telemetry privacy test; restored automatic CI triggers.

`test:services` failed at an Edge authorization request (expected 404, received 500) because the runtime remains unavailable; container DNS separately returned EAI_AGAIN. No security check was disabled. M8 remains incomplete: physical Android validation, full Edge integration, model/receipt fixture evaluation, account erasure implementation/verification and staging rehearsal are outstanding. [Release readiness](RELEASE_READINESS.md) defines the exact gates, including an account-erasure acceptance specification. No user data was deleted, no deployment/publication occurred.

Proceeding with independently authorized L1/L2 implementation does not mark M8 passed. Earlier paused-test notes above are historical checkpoints, superseded by this section.

M8 build evidence: Android Hermes and web exports passed (`npm run build` with cloud cache/offline environment settings). All four Edge tests, including telemetry privacy, passed. These exports are not native APK/device verification.

## L1 — shopping lists

Implemented migration 009 and Shopping UI: manual/editable quantities and units, optional product links, purchased/unpurchased, removed/restored items, revision protection and persisted retry recovery. Recipes links to an explicit shortage review. The server recomputes measured shortages from non-expired stock and preserves one item per recipe ingredient on repeat import; staple assumptions do not fabricate stock. No list action changes stock.

Migration applied locally and schema types regenerated. Real database tests passed for cross-household denial/forged product links, direct-write denial, stale revisions, idempotency, decimal shortage calculation and unchanged stock. The old placeholder UI test was replaced with the authenticated configuration boundary check. Physical-device interaction remains unverified; M8 gates remain open.

L1 final checks: ESLint, TypeScript and all 42 client tests passed. The test-only QueryClient uses infinite garbage-collection time to avoid leaving a timer after the configuration-gate test. Database coverage including L1 passed.

## L2 — weekly planning (2026-10-25)

Implemented migration 202610250010 and Planner UI: Monday–Sunday navigation, manual meals or saved-recipe snapshots, named meal slots, explicit servings, rescheduling, cancellation/restoration, revisions and persisted retry recovery. Recipes links to scheduling. Plans never reserve or change stock. A plan becomes cooked only when its cooking link and stock deductions commit together; one plan cannot be cooked twice, even with different operation IDs. Cooked entries remain immutable history.

Planned servings scale recipe quantities with decimal arithmetic. Fractional item counts and repeating values beyond six decimal places require manual actual-quantity review. Calendar tests cover week/year/DST boundaries.

Migration applied locally and database types regenerated. ESLint and TypeScript passed; all 45 client tests in 10 suites passed. The real PostgreSQL suite passed with L1/L2 authorization, stale revisions, rescheduling/cancellation, no-stock-change scheduling, atomic plan/cooking rollback and linking, repeated cooking and concurrent different-operation confirmations of one plan. Final build evidence is recorded below. Physical Android interaction and M8 release gates remain open.

Milestone commits for this assignment: M8 checkpoint `2f8b07b` (incomplete release gates), L1 `60ca9c0`, and L2 is the commit containing this section. Nothing was pushed or merged, and no app was published.

L2 final build: Android Hermes and web exports passed on the completed Shopping/Planner code. This is a JavaScript export, not an APK or physical-device acceptance result.
