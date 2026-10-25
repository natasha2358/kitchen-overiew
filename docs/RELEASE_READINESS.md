# Android release readiness — M8

Status: **not release-ready**. This is a measured checkpoint, not permission to publish. The user resumed automated tests on 2026-10-24. Shopping and planning can be implemented independently; they do not close these gates.

## Evidence

- Client lint, TypeScript and 42 Jest tests passed at the M8 starting revision.
- Real PostgreSQL household isolation, inventory transactions/rollback, receipt ownership/confirmation/semantic duplicates, preference leases, cooking splits and concurrent confirmation suites passed.
- Auth signup, unverified denial, real Mailpit confirmation, password recovery/change and logout passed after correcting the harness to accept Supabase's HTTP 303 redirect (as well as 302).
- PDF/proposal Edge tests passed; new telemetry coverage checks that request payloads and exception details never enter responses/logs.
- Earlier Edge integration failed because dependencies were unreachable. Superseded by the cloud compatibility checkpoint below: real runtime service and erasure tests now pass.

## Operational visibility

Each Edge handler emits fixed function name, status, outcome and elapsed milliseconds, including unexpected failures. Generation additionally records configured model/prompt version and provider token counts when supplied. No request IDs, user/household IDs, filenames, private payloads, URLs, tokens or exception messages are logged. Retained suggestion attempts provide generation status/error category and rate-limit enforcement. Use platform log retention controls before production; no external monitoring account was provisioned.

## Remaining gates

| Gate | Required evidence |
| --- | --- |
| Deployed Edge integration | Cloud runtime upload/deletion/erasure and JWT denial tests pass; validate the eventual hosted configuration and complete model refusal/lease orchestration tests |
| Real receipt coverage | Sanitized supermarket text/scanned fixtures, implemented extraction, field/line quality, latency and cost results; integration is implemented; live model quality is not evaluated |
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

At the preceding checkpoint, the unmodified Edge runtime could not bootstrap: direct container DNS failed, and a proxy-configured retry failed its tunnel; the dependency host deno.land returned HTTP 403 through the environment proxy. No authentication, TLS or RLS checks were disabled. Run `test:services` through the actual runtime in a working environment before release. Real parsing, paid model evaluation, physical Android, native artifact and staging evidence remain missing.

Final checks for this checkpoint: lint/typecheck and 48 Jest tests in 11 suites passed; all four Edge tests and Edge compilation passed; database and handler integration suites passed; Android Hermes/web exports passed. Native interaction, APK and remote CI outcomes are unverified.

## Cloud workaround and REWE sample — 2026-10-25

The real runtime now starts without downloading dependencies inside Docker. Official bootstrap/std sources are checksum-verified and bundled on the host. A local compatibility patch verifies Auth-issued ES256 signatures via its trusted JWKS; all function JWT and handler authentication checks remain active. Cloud tests pass through Kong and real Edge workers, including foreign-household denial, uploads, protected PDF validation, hash identity, source deletion/replacement and account erasure failure recovery. Forged HS256/ES256, unsigned, malformed and expired tokens are rejected before handler execution. This supersedes the earlier cloud runtime blocker, not the hosted deployment gate.

The private two-page REWE sample has readable embedded text: all 33 priced source labels were preserved. Fictional reconstructed fixtures cover readable owner-protected versus opening-password-protected PDFs. Eight Edge tests pass, including routing and protected PDF regressions; no model interpretation or scanned receipt accuracy is claimed. At that checkpoint automatic parsing still returned 501; the integration below supersedes that implementation boundary.

You do not need Docker locally for these checks. Physical Android still requires a device and reachable development/staging backend; no public tunnel, external project or deployment was created. CI now runs the cloud setup and real runtime checks; remote CI outcome has not been observed.

## Receipt-to-draft integration checkpoint

Migrations 014–015 implement two attempts/two reserved calls per attempt, active leases and revision/source/erasure guards. The model integration supports structured text proposals and opt-in inline PDF vision, with bounded transient retries and explicit refusal/incomplete/invalid-result failures. It is enabled only by server key/model configuration. The UI shows proposal evidence and unresolved quantities, keeps dirty edits safe and requires reviewed stock confirmation.

Evidence: 51 client tests in 12 suites, lint and TypeScript passed; 17 Edge tests and compilation passed; real database isolation/rollback/lease/call-budget tests passed. The mocked full flow also passed in real Edge workers behind Kong, including concurrent requests, fallback/refusal, source-hash mismatch, rate limiting, preserved edits, manual confirmation and unchanged stock before confirmation. Android Hermes/web exports passed. Fixture routes are test-only and normal startup excludes them.

No paid model call or real-model extraction accuracy evaluation occurred. No physical Android, native APK, hosted deployment or staging evidence was added. Original receipt data remains outside Git. A chosen/configured model and explicitly authorized live evaluation are the next quality gate; mock output is never evidence of model quality.
