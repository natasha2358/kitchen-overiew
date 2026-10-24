# Implementation status

Branch: `feat/smart-kitchen-foundation`. No push, merge, app publication, production deployment, paid infrastructure, or external account modification was performed.

**Testing is paused at the user's request.** The code for the four assigned milestones is present. Runtime verification of authentication, inventory, and receipt flows remains incomplete; do not treat implementation as a verified release.

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

Migration `202610240003` creates receipt/import entities and protected RPCs. Migration `202610240004` creates the private bucket and Storage policies. Only the first three migrations are applied in this cloud instance. The fourth is blocked by missing `storage.buckets`: the full Storage service schema is not initialized in the reduced local stack. It must be applied with the full Supabase stack before uploads can work.

`verify-receipt` validates an authenticated user's ownership before downloading the private object or calling the service-role hash-registration RPC. `parse-receipt` authenticates and checks ownership, then explicitly returns `501 PARSING_NOT_CONFIGURED`. No fake extraction is returned. No OpenAI binding or real supermarket fixtures were supplied; simply adding a key does not enable parsing.

Synthetic text and image-only PDFs plus a hand-authored proposal fixture are included. They test structural/contract boundaries only. A genuine encrypted PDF fixture and real supermarket digital/scanned fixtures are still needed. Parser/model choice, line-coverage evaluation, extraction leases, bounded two-call orchestration, timeouts, and late-result protection belong to the future parsing implementation.

Confirmation of receipt lines into inventory is roadmap M5 and is not implemented. Duplicate attempt objects remain private; redundant-object cleanup and source deletion are deferred. Native picker behavior and full Storage/Edge integration are unverified.

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
| Local migration `004` | Blocked: Storage service schema absent |
| `npm run db:types` | Generated from the applied public schema |
| Final `npm run typecheck` | Passed after implementation and type generation; compilation only, no tests |
| `npm run test:db`, `test:auth`, `test:services` | Written, never executed |
| Final full tests/export, Android APK/device | Not run; testing paused by user |

Earlier tooling/test failures (read-only caches, async renderer usage, lint configuration, fixture-relative paths) were corrected before their recorded passing runs. These results are revision-specific; there is no final all-green test run.

## Cloud environment limitation

Docker uses `vfs` on a 32 GiB filesystem. The standard PostgreSQL image exhausted disk space while unpacking. A checksum-verified `crane` release exported the official digest-resolved image; its filesystem was imported as one local layer and its runtime configuration matched the source. This enabled PostgreSQL and postgres-meta to start after optional service images were removed. No existing user data was deleted; only this task's failed, uninitialized container and downloaded optional images were removed.

The cloud instance currently runs the database/metadata subset, not the full application backend. Auth, Storage, and Edge runtime services need a Docker environment with enough storage (ordinary Docker Desktop/overlay2 is recommended). The flattening helper addresses image unpacking; it is not proof that the full stack fits this cloud machine.

## Next steps

1. Review the implementation; keep the current working branch separate from main.
2. On a development computer, start the full Supabase stack, apply all four migrations, and serve the Edge Functions. See README for exact commands and Android instructions.
3. Set only the public Supabase URL/anon or publishable key in `.env.local`; configure exact email redirect URLs for the chosen Expo client.
4. When testing is authorized again, run the prepared lint/type/unit, database, Auth/email, Edge, and Storage integration commands. Fix any discovered failures before claiming readiness.
5. Run Android startup/navigation, email callbacks, inventory, picker/cancel, upload recovery, and review on a real device/emulator. Native/API integration remains the main verification gap.
6. Obtain sanitized supermarket fixtures and make a separately evaluated server-side parsing implementation. Keep privileged/model credentials server-side.

## M5 preparation checkpoint

The user reaffirmed the testing pause. No tests were run during this preparation. Receipt review now retains unsaved edits across background refreshes, uses the revision on which edits were based, and offers explicit reload/discard handling. Review feedback now flags invalid values and product/unit dimension mismatches. TypeScript compilation passed during this work; additional tests were written but not executed.

The image-flattening helper now supports the pinned Storage and Edge runtime images as well as PostgreSQL. Storage image preparation completed; Edge image preparation and restarting the full backend are still in progress at this checkpoint. Migration 004 remains unapplied until the Storage service schema is available. See [M5 readiness](M5_READINESS.md) for the remaining gates; M5 itself has not started.

The checkpoint was pushed to GitHub at the user's request. The existing workflow had push/PR triggers, so that first push may have queued remote checks; Actions API access is blocked here and the remote outcome is unknown. Automatic workflow triggers have now been replaced with manual `workflow_dispatch` during the user's testing pause. No local test command was run. Restore automatic CI triggers when testing resumes.
