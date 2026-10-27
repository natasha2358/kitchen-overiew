# Implementation status

Current checkpoint: compact responsive UI refinement and Chromium desktop/mobile-web smoke checks are complete (see final sections). Receipt model integration, proposal review and bounded recovery are implemented and tested with mocked providers in real cloud Edge workers. Live model quality, scanned fixtures and physical Android validation remain open. See the final section for current evidence; earlier milestone sections are historical.

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

## MVP gap closure — account erasure and handler integration (2026-10-25)

User selected MVP gaps before L3 shared households. Previous milestones through L2 (`884f0f3`) were pushed to `feat/smart-kitchen-foundation`. L3 remains unstarted.

Implemented Account settings and password-confirmed, resumable erasure across private Storage, household data and Auth. Migrations 011–013 add private jobs, service-only RPCs, frozen-household RLS, write/upload guards and bootstrap protection. Preparation captures receipt IDs so the requesting device clears pending household drafts before irreversible deletion. Continuation revokes sessions, removes files through Storage APIs, purges database rows atomically and deletes Auth last. Sole-owner enforcement prevents this MVP flow deleting a shared household. Auth-gone/job-cleanup failure requires the scoped operator reconciliation documented in Architecture.

Extracted function handlers from their Deno entrypoints and added a loopback-only harness using real local Auth and Storage. It is test infrastructure, not a replacement backend or proof that the actual Edge gateway works. Added the harness to CI; remote CI outcome has not been inspected. No credentials, production deployment, main merge or app publication were introduced. Only disposable test-created accounts/data were deleted.

Verification on this checkpoint:
- `npm run check`: ESLint, strict TypeScript and 48 tests in 11 suites passed.
- `npm run test:db`: isolation, rollback, stock/receipt/cooking/planner concurrency and new erasure authorization, injected purge rollback, Auth-last and freeze-concurrency tests passed.
- `npm run test:handlers`: real Auth/private Storage handler tests passed, including deletion/replacement of receipt source, wrong password/foreign-target denial, frozen uploads, injected Storage failure and resumed complete erasure preserving another account.
- `npm run check:edge` and `npm run test:edge`: compilation and all four structural/contract/telemetry tests passed.
- `npm run build`: Android Hermes and web exports passed using documented cloud cache/offline settings. This is not APK or native UI validation.
- Migrations applied locally; database types generated from the schema. `git diff --check` passed.

A preliminary concurrency assertion incorrectly expected a new shared lock to fail while freezing was only queued. Corrected the test to assert failure once the eraser actually holds its exclusive lock, and reran the full database suite successfully. Existing writes may finish before freezing; they cannot write after the freeze is committed.

Actual Supabase Edge startup remains blocked: container DNS failed; a proxy-enabled retry failed its tunnel and deno.land returned HTTP 403 through the environment proxy. No JWT/TLS/RLS protections were bypassed. Thus `test:services` through the actual runtime is still an open gate despite passing handler tests.

Next: run the actual runtime and native account/receipt journey in a working Docker/device environment; supply sanitized representative supermarket fixtures to implement and measure extraction (currently explicit 501); configure and separately authorize model quality evaluation; rehearse staging migrations and native builds before any release. M8 remains incomplete. See RELEASE_READINESS.md for the full evidence matrix and README for Android setup.

## Cloud Docker workaround and first REWE sample (2026-10-25)

The user cannot run Docker locally. Backend work now runs entirely in this cloud workspace; no user-side Docker setup, hosted project, public tunnel or paid infrastructure was required.

### Runtime blocker resolved for cloud verification

Added `cloud:edge:prepare` and `cloud:edge:start`. Host-side bundling uses official CLI 2.75.0 bootstrap and std 0.224.0 source files pinned by SHA-256 in `scripts/cloud-edge-sources.json`, plus locked npm dependencies. Real Edge Runtime 1.70.0 executes the resulting application entrypoints behind the existing Kong gateway. Bundles are ignored, contain no keys and mount read-only; local runtime keys are transferred through a temporary mode-0600 environment file removed after startup.

Initial runtime startup succeeded, but service tests exposed a separate 401: the old bootstrap only accepts HMAC while Auth issues ES256. The development compatibility patch retains signature verification, allows only HS256/ES256, verifies ES256 against trusted local Auth JWKS with the authenticated audience, and keeps all handler Auth checks. A further failure revealed injected proxy defaults overriding supplied NO_PROXY settings; the runtime process now adds only internal Docker aliases to exclusions. JWT errors log a fixed message without token claims. Nothing disables RLS, TLS or authentication.

Final real gateway tests reject malformed/unsigned/expired/forged HMAC and forged ES256 tokens. `test:services` and `test:erasure` now pass through the actual runtime, including foreign-household denials, canonical uploads, private source deletion/replacement, frozen-account handling and injected Storage deletion failure recovery. CI is configured to reproduce this setup; remote CI outcome is unverified. This closes the cloud runtime blocker, not hosted deployment/native acceptance.

### Receipt sample and validator correction

The supplied two-page German REWE eBon has embedded text and password-free owner protection with copying permitted. The old pdf-lib validator wrongly rejected it as encrypted. `unpdf` 1.9.1 / PDF.js 6.4.299 now handles structural validation and initial text extraction. Files that actually require an opening password still fail. Existing 10 MiB/10-page limits remain; rendering/WASM are disabled and no PDF instructions are executed. Official package API documentation was read from its npm README.

A private local extraction probe preserved all 33 priced source labels across both pages. This is text coverage, not grocery interpretation or model accuracy. The original receipt and its payment/loyalty/fiscal data remain outside Git. Newly generated fictional PDFs and expected annotations exercise weighted quantities, repeated purchase counts, missing package sizes, deposits/discounts, ambiguous labels and protected-PDF behavior. Fixture creation never reads the original.

The helper explicitly marks sparse, garbled, partly blank, excessive or absent text as needing vision; no vision/model call is made. Unknown quantities and package sizes remain unknown. `parse-receipt` still returns 501: model interpretation, leases/retries and persisted draft integration remain open. One digital sample is not universal REWE/scanned-receipt support.

### Verification

- `npm run check`: lint, TypeScript and 48 client tests passed.
- `npm run check:edge` and `npm run test:edge`: compilation and all eight tests passed, including four new extraction/protection tests.
- `npm run cloud:edge:prepare` and `npm run cloud:edge:start`: real runtime started with locally bundled dependencies and active JWT validation.
- `npm run test:edge:gateway`, `npm run test:services`, `npm run test:erasure`: passed through Kong and real Edge workers, including readable protected-PDF acceptance and opening-password rejection.
- `npm run test:handlers`: independent host-handler tests also passed against real Auth/Storage.
- Private original-sample extraction: 2 pages, 33/33 priced labels preserved; no original text is committed.
- `git diff --check` passed. No database schema/client UI changed; previous database concurrency and Android/web export evidence is unchanged, not newly rerun.

Next implementation work: receipt model/vision orchestration and editable draft persistence with bounded calls, revision/lease protection and mocked model tests. Real model quality/cost evaluation still needs server configuration and explicit paid-call authorization. Physical Android validation needs a reachable test backend; this workspace has not been exposed publicly. L3 sharing remains deferred.

## Receipt-to-draft integration (2026-10-25)

Implemented the next MVP gap using the existing database and Edge Functions. Migrations 014–015 add service-only extraction claims, durable call reservations, two attempts/two calls per attempt, 60-second leases, household rate limiting, model/prompt/route metadata, source positions and transactional completion. Source hash is rechecked before processing. Review saves, source deletion/replacement, account erasure, stale revisions and expired attempts block late results. Completion never writes inventory and does not accept incomplete coverage. Types were generated from the local migrated schema.

The OpenAI Responses integration sends embedded text first and supports opt-in inline PDF vision. A 45-second abort signal bounds Storage/model work; fallback and transient retries share the reserved budget. Refusal, malformed output and truncated envelopes fail explicitly. Streaming response size and output tokens are capped. Model output cannot nominate products, locations or expiry; decimal/whole-count validation checks quoted quantity evidence and package arithmetic. Prices alone are not quantities. The supplied REWE layout has a narrow source-order/line-count check independent of the model's claimed completeness.

Receipt review now generates/retries proposals, exposes status and budgets, shows original proposed values/quantity evidence/package details/issues, suggests confirmed name/alias matches without automatically merging, and keeps unsaved edits intact. Locations remain unresolved until user review; stock still requires saving and explicit atomic confirmation. The upload disclosure now describes actual processing and confirmation behavior. No local draft key was added.

Added `.env.server.example` with blank key/model values. Live configuration requires server-only `OPENAI_API_KEY` and `OPENAI_RECEIPT_MODEL`; PDF vision additionally requires `OPENAI_RECEIPT_VISION=true` and a compatible model. Cloud startup accepts an allowlisted ignored model environment file. Test-fixture startup rejects live model configuration. Nothing provisions credentials or paid infrastructure.

### Verification and corrections

- `npm run check`: lint, strict TypeScript and 51 tests in 12 suites passed, including dirty-edit protection, configuration failure/manual entry and unresolved AI review UI.
- `npm run check:edge` and `npm run test:edge`: compilation and 17 tests passed. Coverage includes text/vision routing, shared retry/fallback limits, refusal, malformed/truncated/oversized responses, in-flight abort, unsupported/inferred quantities and missing/reordered REWE rows.
- `npm run test:db`: real isolation/atomicity/concurrency suites passed, plus private RPC denial, proposal rollback/order, bounded reservations, expired attempts, preserved review/source deletion and frozen-household completion denial.
- `npm run test:handlers`: mocked processing passed with real Auth, private Storage and PostgreSQL; existing service and account-erasure tests also passed.
- `npm run test:receipt-processing` against the real Edge worker fixture route: concurrent requests created one draft, incomplete text fell back once, refusal persisted a safe failure, source tampering consumed no model call, rate limits denied excess receipts, late output preserved edits, and explicit reviewed confirmation created stock once.
- Android Hermes/web export passed with documented cloud cache/offline settings. This is not an APK or device result.
- First type-generation attempt used the blocked ECR default; rerunning with `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` succeeded. Deno compilation required the named Decimal export; corrected before passing checks.

The fixture model is explicitly injected in test-only modules, never selected by production requests. It was also bundled into a separate test-only Edge worker for runtime validation; normal startup omits that worker. No real model API call occurred and no live receipt interpretation quality is claimed. Official current Responses input-file/structured-output types were checked at https://github.com/openai/openai-node/blob/master/src/resources/responses/responses.ts .

Remaining gates: choose/configure a model and explicitly authorize live quality/cost evaluation; acquire annotated scanned/other receipt formats; test physical Android including PDF selection and recovery; validate an authorized staging/hosted environment. The original uploaded receipt stays outside Git. No production deploy, main merge or publication was performed.

Final runtime checks also passed for JWT denial, real service integration and account erasure on normal startup. The fixture worker was removed from active configuration and its URL returned HTTP 404. The blank server environment template was exercised without credentials or model calls. `git diff --check` passed. CI was updated for the same mocked worker flow; remote CI outcome has not been observed.

## 2026-10-26 — Reported layout text and Android dependency errors

The supplied development log showed empty-string children and explicit whitespace inside Cards in batch management and Shopping. Replaced truthy JSX guards with boolean guards across screens, removed layout-only whitespace expressions in Shopping, Planner, Account and Cooking, and enabled `react/jsx-no-leaked-render` to prevent conditional strings/numbers reaching layout containers. Text spacing inside Body remains intact. Added rendering regressions for batch management and Shopping, including empty feedback and form validation; the test Card explicitly enforces the raw-text restriction that the native test renderer otherwise misses.

The reported Android `react-native-screens` resolution failure did not reproduce here: the dependency is already declared, locked, and installed at 4.30.0. README now documents stopping Metro, running `npm ci`, inspecting `npm ls react-native-screens`, and restarting with `npx expo start --clear --lan`. No dependency versions or backend configuration changed. The React DevTools message is informational.

Verification: `npm run check` passed (lint, strict TypeScript, 53 tests in 13 suites); `npm ls react-native-screens` passed; `npm run build` with documented cloud cache/offline settings exported Android Hermes and web bundles; `git diff --check` passed. The first check caught a lint issue in the new test helper, corrected before the passing run. No physical Android/Windows installation was available, so the user's local resolution error still requires the documented reinstall and cache reset. No database/service tests were needed for these UI-only changes.

## 2026-10-26 — Compact interface, stage 1

Implemented denser shared typography/cards, secondary/primary/destructive actions, wrapping toolbars and segmented controls, searchable inline selectors, and expandable secondary settings. Controls retain 48-point minimum heights; labels wrap without truncation. Kitchen now uses searchable batch rows with location/expiry summaries and a desktop detail panel at 960px (stacked navigation for smaller screens or enlarged fonts). Common stock changes share one editor; removal requires a separately labeled confirmation. Product settings open the selected product rather than requiring users to find it in a catalogue. Existing stock RPCs and retry intents are unchanged.

Validation: lint, TypeScript and 56 tests in 14 suites passed, including selector search/selection, disabled controls, disclosure state and batch/Shopping raw-text regressions. A test matcher incompatibility was corrected during verification. Browser/device appearance and interaction validation remain pending; this is not physical Android evidence.

## 2026-10-26 — Compact interface, stage 2

Applied compact selectors and grouped actions to grocery creation, product/location settings, Shopping, Planner, Recipes and receipt review. Shopping uses a responsive list/editor layout; Planner days use one/two/three columns; recipe preferences and steps expand on demand. Receipt product/location choices are searchable and units segmented, with proposals, unresolved values and confirmation rules preserved. Catalogue editing keeps the selected product after saving, protects existing units and requires a separate delete confirmation. Kitchen filters moved into an expandable section and detail quantities no longer show six trailing decimal zeros. Cards use subtle shadows and borders. No server schema, Auth/RLS, stock arithmetic or mutation contracts changed.

Added development-only `playwright-core` for repeatable `npm run test:ui` against installed Chromium and loopback Supabase. The harness provisions only fictional fixture accounts/stock, signs in via the UI, and cleans up its own records via the existing erasure functions. Screenshots remain ignored under `.ui-artifacts/`.

Browser evidence: Chromium at 1440×1000 and 390×844 passed sign-in, desktop list/detail selection, searchable location selection and explicitly confirmed movement, preselected product settings, mobile detail navigation, and the removal confirmation gate (stock unchanged before confirmation). Shopping/Planner/Recipes/Receipts route smoke checks had no horizontal overflow or JS/raw-text errors. Four complete inventory rows fit above the bottom navigation at 390×844; desktop and mobile screenshots were visually inspected. This is mobile-web evidence, not native Android certification. Enlarged-font, TalkBack, complete populated planner/receipt journeys and real Android keyboard/picker acceptance remain open.

Final stage-2 verification: `npm run check` passed without lint warnings (strict TypeScript and 57 tests in 14 suites); `npm run test:ui` passed; `npm run build` exported Android Hermes and web bundles with cloud cache/offline settings; `git diff --check` passed. Initial import-order warnings were corrected. Product totals remain available in batch details using decimal-safe aggregation. Backend-wide concurrency/RLS tests were not rerun because database and mutation contracts did not change; the browser test exercised a real authenticated location transaction. No APK or production deployment was performed.

## 2026-10-27 — Used-up action and collapsed account menu

Batch details now expose **Used up → Confirm used up**, without entering zero or opening advanced actions. Cancellation preserves the editor; offline/busy/exhausted batches cannot start the action. Confirmation uses the existing authorized, revision-checked, idempotent `remove` transaction: it clears only that batch, preserves history and leaves other batches unchanged. The ledger continues to record `remove`; this shortcut does not invent a cooking event. Account settings and sign-out are hidden inside an accessible expandable Account menu.

Browser verification passed with a real disposable local household: account actions start hidden, expand and collapse; choosing Used up leaves stock unchanged; confirming clears the batch and removes its active row. The first browser run encountered a locator matching both a hidden retained route and its visible replacement; the test now targets the visible textbox by role. Android Hermes/web exports passed. Native Android/TalkBack acceptance remains open.

Receipt readiness: existing PDF selection/private upload/verification, draft review and explicit stock confirmation remain implemented. Automatic interpretation requires server-only OPENAI_API_KEY and OPENAI_RECEIPT_MODEL, optionally PDF vision. No .env.server.local exists in this checkout. The user's actual running backend/configuration is not known. The REWE sample is already available privately; live model accuracy/cost tests require configured credentials and explicit paid-call authorization. No live model calls or external provisioning were performed.

Final verification: `npm run check` passed (lint, TypeScript, 58 tests across 14 suites), `npm run test:ui` passed, `npm run build` passed with cloud cache/offline settings, and `git diff --check` passed. Added cancellation and explicit used-up confirmation regressions.
