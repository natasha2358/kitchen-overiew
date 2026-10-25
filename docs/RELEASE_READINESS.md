# Android release readiness — M8

Status: **not release-ready**. This is a measured checkpoint, not permission to publish. The user resumed automated tests on 2026-10-24. Shopping and planning can be implemented independently; they do not close these gates.

## Evidence

- Client lint, TypeScript and 42 Jest tests passed at the M8 starting revision.
- Real PostgreSQL household isolation, inventory transactions/rollback, receipt ownership/confirmation/semantic duplicates, preference leases, cooking splits and concurrent confirmation suites passed.
- Auth signup, unverified denial, real Mailpit confirmation, password recovery/change and logout passed after correcting the harness to accept Supabase's HTTP 303 redirect (as well as 302).
- PDF/proposal Edge tests passed; new telemetry coverage checks that request payloads and exception details never enter responses/logs.
- Storage/Edge integration failed at the first Edge ownership check: expected 404, received 500. The Edge container is not running because container DNS cannot resolve dependencies (`EAI_AGAIN` for deno.land). This is unresolved, not a passing authorization test.

## Operational visibility

Each Edge handler emits fixed function name, status, outcome and elapsed milliseconds, including unexpected failures. Generation additionally records configured model/prompt version and provider token counts when supplied. No request IDs, user/household IDs, filenames, private payloads, URLs, tokens or exception messages are logged. Retained suggestion attempts provide generation status/error category and rate-limit enforcement. Use platform log retention controls before production; no external monitoring account was provisioned.

## Remaining gates

| Gate | Required evidence |
| --- | --- |
| Edge networking / integration | Working local Docker networking; run test:services and cover source deletion/replacement and generation refusal/lease recovery |
| Real receipt coverage | Sanitized supermarket text/scanned fixtures, implemented extraction, field/line quality, latency and cost results; current parser is a configuration boundary |
| Meal model selection | Configure server-only key/model, explicitly authorize paid evaluation, record supported model and prompt evidence |
| Android acceptance | Physical device, OS/app/build version, font scaling and TalkBack, sign-in/PKCE recovery, PDF picker/cancel, upload/review/confirmation, retries/offline, meal assumptions, cooking and history |
| Account erasure rollout | Implemented and tested locally with disposable accounts; verify native UI and deployed Edge runtime, including operator reconciliation |
| Staging rehearsal | Separately authorized staging target, forward migrations and backup/restore evidence; no destructive reset of user data |
| Native release artifact | APK/device validation, signing/distribution configuration reviewed separately; JavaScript export is not an APK |

## Account-erasure acceptance specification

The `erase-account` endpoint and Account screen are implemented in migrations 011–013. They require explicit owner intent plus recent reauthentication, freeze further writes and generation, and persist an erasure operation before removing resources. Revoke sessions, remove all private source and duplicate/replacement objects through Storage APIs, delete household rows in foreign-key order, then remove the Auth identity. Include shopping items and planned meals once those tables exist. A partial failure must be resumable without exposing data to another account; an expired token must not strand the recovery workflow. Never delete Storage metadata directly or infer erasure from a successful Auth deletion alone.

Local disposable-account tests now cover: another owner/anonymous caller is denied; interrupted Storage deletion resumes; no in-flight upload or generation recreates erased data; all private objects and database references are removed; retries are idempotent; no credentials/payloads enter logs. Only test-created disposable accounts were erased; existing user data was not removed.

## Device journey

Follow README Android setup. Record device/OS, commit and date for each result. Use isolated fixture accounts. Verify sign-up/email callback, add/edit/waste/move inventory, import/review a PDF, confirm once and retry, delete/re-upload its source, generate with staple off/on/off, confirm 15 ml use as 10 ml tracked + 5 ml explicit untracked, and repeat after lost responses. Check account switching, airplane mode, enlarged text and TalkBack. Record each failure and reproduction; do not replace device evidence with unit-test results.

M8 build evidence: Android Hermes and web exports passed (`npm run build` with cloud cache/offline environment settings). All four Edge tests, including telemetry privacy, passed. These exports are not native APK/device verification.

## L1/L2 follow-through (2026-10-25)

Shopping and weekly planning are implemented. The latest client suite has 45 passing tests, with lint/typechecking passing. Real database tests cover both features, including unchanged stock during list completion/scheduling and concurrent confirmation of one planned meal. Android acceptance must additionally cover shortage import, shopping retry recovery, week navigation, rescheduling/cancellation, serving decisions and planned cooking. These results do not close the Edge runtime, fixture, model or physical-device gates.

## MVP gap closure — 2026-10-25

Local erasure tests passed against real PostgreSQL, Auth and Storage: password verification, foreign-target rejection, private RPC denial, write/upload freeze, storage failure recovery, database rollback injection, retry safety, Auth-last deletion and preservation of another household. Concurrent tests verify freeze waits for active writes and later writes fail without reverse-lock deadlock.

`test:handlers` exercises real function handlers on a loopback Deno server with local backend credentials and no OpenAI configuration. It also verifies private uploads, ownership, canonical hashing, source deletion/replacement and the parsing/model configuration boundaries. CI now includes this command. These results do not establish Supabase gateway or deployment behavior.

The actual Edge runtime still cannot bootstrap: direct container DNS failed, and a proxy-configured retry failed its tunnel; the dependency host deno.land returned HTTP 403 through the environment proxy. No authentication, TLS or RLS checks were disabled. Run `test:services` through the actual runtime in a working environment before release. Real parsing, paid model evaluation, physical Android, native artifact and staging evidence remain missing.

Final checks for this checkpoint: lint/typecheck and 48 Jest tests in 11 suites passed; all four Edge tests and Edge compilation passed; database and handler integration suites passed; Android Hermes/web exports passed. Native interaction, APK and remote CI outcomes are unverified.
