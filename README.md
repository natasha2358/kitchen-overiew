# Smart Kitchen

Android-first Expo application for household grocery inventory and private receipt drafts. Recipes supports configured meal suggestions; Shopping supports manual lists and recipe shortages. Planner supports weekly scheduling and explicit cooking review. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for tested capabilities and limitations.

## Requirements

- Node 24 and npm (use `npm ci`, committed lockfile).
- Docker and Supabase CLI **2.75.0** for local PostgreSQL/Auth/Storage/Edge Functions. No hosted project or paid account is required for local development.
- Android device with an Expo Go version supporting SDK 58, or Android Studio/emulator and the SDK required by Expo 58 for a development build.

## Local backend

From the repository root:

```sh
npm ci
supabase start -x studio,imgproxy,logflare,vector,supavisor,realtime
supabase migration up --local
npm run db:types
```

Use `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start -x studio,imgproxy,logflare,vector,supavisor,realtime` if ECR access is unavailable. The CLI uses the official Supabase Docker Hub images. Start/migrate an existing instance; do not reset a database containing user data.

Copy `.env.example` to `.env.local`. Use the local API URL and **anon** key from `supabase status`, or your own existing Supabase project's URL and publishable key. Never put a service-role key or an OpenAI key in Expo variables. Do not commit `.env.local`.

- Android emulator: API URL `http://10.0.2.2:54321`.
- Physical Android on the same Wi-Fi: API URL `http://YOUR_COMPUTER_LAN_IP:54321`. Allow LAN access through the local firewall only as needed.
- Web on the development machine: API URL `http://127.0.0.1:54321`.

Supabase authentication requires email confirmation. Local emails are available in Mailpit at the address shown by `supabase status`. Add the exact authentication redirect returned by Expo's `Linking.createURL('auth/callback')` (typically `exp://YOUR_COMPUTER_LAN_IP:8081/--/auth/callback` in Expo Go) to `[auth].additional_redirect_urls` in `supabase/config.toml` for Expo Go, and restart the local Supabase services. Development builds use `smartkitchen://auth/callback`, already listed. Web uses `http://localhost:8081/auth/callback`. Open PKCE links on the device/browser that requested them. You can also verify an account using the web app, then sign into that verified account on Android.

## Run on Android

1. Start and migrate local Supabase as above, then configure `.env.local` for your device.
2. Run `npm start -- --lan` on your computer. The cloud workspace does not provide a phone-accessible preview.
3. Open Expo Go and scan the QR code, or launch an emulator and run `npm run android`.
4. If Expo Go does not support this SDK, install the Android SDK/JDK required by Expo, then run `npx expo run:android` to build and install locally. Generated `android/` is ignored. No EAS or production publication is needed.
5. Create an account, verify its email using the local Mailpit link on the same client, then sign in. A household and three default locations are provisioned once.

### Missing dependency when starting Android

If Metro reports `Unable to resolve "react-native-screens"`, stop Expo with Ctrl+C and run these commands from the folder containing `package.json` (PowerShell or a terminal):

```sh
npm ci
npm ls react-native-screens
npx expo start --clear --lan
```

The package and its Expo-compatible version are already in the committed manifest and lockfile. `npm ci` restores that exact dependency tree; keep `package-lock.json`. Then reopen the app or press `a` for an Android emulator. If installation fails, resolve that npm error before restarting Metro. The React DevTools message on web is informational.

## Checks

Automated testing has resumed. See docs/RELEASE_READINESS.md for passing checks and remaining release gates.

```sh
npm run check        # lint, strict TypeScript, Jest
npm run test:db      # real local PostgreSQL roles; test data rolled back
npm run build       # Android Hermes JavaScript + web export, not an APK
```

Generated database types must come from the applied migrations (`npm run db:types`), not manual edits. Integration scripts refuse non-loopback backend endpoints.

## Cloud workspace notes

The sandbox has a read-only home directory. Use `npm_config_cache=/workspace/.npm-cache`, `XDG_CACHE_HOME=/workspace/.cache`, `EXPO_NO_TELEMETRY=1`, and shell-only `__UNSAFE_EXPO_HOME_DIRECTORY=/workspace/.expo-home`. `EXPO_OFFLINE=1` allows Metro/export to use the SDK's installed compatibility data when Expo metadata hosts are blocked; it does not make the application offline-capable. Keep Expo's cache path outside project environment files. The existing checkout is already isolated; do not create another worktree unless explicitly requested.

If the cloud Docker daemon uses `vfs`, PostgreSQL's many image layers can exhaust the 32 GiB filesystem while unpacking. `scripts/flatten-supabase-image.py` exports the official, digest-pinned image with `crane` and imports the same root filesystem/configuration as one local layer. It never pushes an image. Install a trusted `crane` release with its published checksum verified, then run `CRANE_BIN=/path/to/crane python3 scripts/flatten-supabase-image.py` before Supabase startup. This workaround is unnecessary on ordinary Docker Desktop/overlay2 installations.

Local email rate limits are raised to 100/hour in `supabase/config.toml` for repeated automated confirmation/recovery tests. This configuration is local development configuration, not a production security recommendation.

## Receipt foundation

Run `supabase functions serve` in another terminal when using receipt uploads. All Edge Functions require JWT verification and perform their own user/ownership checks. The private `receipts` bucket is created by migration. No OpenAI credential is needed for upload verification or manual review.

`parse-receipt` now implements embedded-text interpretation and optional PDF vision fallback through the OpenAI Responses API. It remains `501 PARSING_NOT_CONFIGURED` without both server-only `OPENAI_API_KEY` and `OPENAI_RECEIPT_MODEL`. Configure a model supporting structured outputs; set `OPENAI_RECEIPT_VISION=true` only when that model also supports PDF file input. There is no default model and no live model-quality claim.

Apply migrations through 015. Open a verified receipt and choose **Generate / retry receipt draft**, then review every source/proposal line, resolve quantities and product matches, assign locations, save the review and explicitly confirm stock. Deposits/discounts/non-food lines start excluded; ambiguous groceries remain unresolved. Manual entry remains available without model configuration. Saved edits, deleted sources and confirmed stock cannot be overwritten by a late model result.

Each receipt permits two explicit attempts, each with at most two model calls shared by fallback and transient retries. Calls are reserved durably before sending, including requests whose replies are lost. Model work has a 45-second deadline and a 60-second lease; a disconnected client can reload or retry after lease expiry. Exhausted budgets require manual entry. Five recently processed receipt identities per household are allowed in ten minutes.

Copy `.env.server.example` to an ignored `.env.server.local` and configure values through trusted server tooling, never chat or Expo public variables. With ordinary Supabase tooling use `supabase functions serve --env-file .env.server.local`. With this cloud's compatibility setup, recreate only `kitchen_cloud_edge` and run `npm run cloud:edge:start -- --model-env-file .env.server.local` after preparing bundles. This transfers only allowlisted model settings to the server. Do not combine live model configuration with test-fixture startup. Paid live evaluations have not been run.

Saved reviews can be confirmed once into stock with duplicate warnings and retry protection. Source PDF deletion retains confirmation history. Deterministic model mocks and real Auth/Storage/PostgreSQL/Edge-worker tests pass; physical-device and live model-quality validation remain open.

Additional checks:

```sh
npm run test:auth       # local Mailpit email confirmation/recovery and Auth
npm run check:edge      # Edge Function TypeScript compilation
npm run test:edge       # synthetic PDF and proposal contracts
npm run test:services   # Auth, private Storage and actual Edge runtime integration
npm run test:handlers   # real handlers with local Auth/Storage; no Edge bootstrap
```

The cloud instance runs PostgreSQL, Auth, Storage, REST, gateway, Mailpit and metadata, with migrations 001–015 applied. The real Edge Runtime now runs through the cloud compatibility setup below. You do not need Docker on your own computer for development or backend verification here. Physical Android testing still needs a device and a reachable test backend.

### Cloud Edge workaround (maintainer commands)

The pinned CLI bootstrap downloads blocked dependencies and only understands HS256 while local Auth issues ES256. We bundle checksum-pinned official bootstrap/std sources and npm dependencies on the host, add ES256 verification against local Auth's JWKS, and run the actual Supabase Edge Runtime 1.70.0. JWT validation and each handler's Auth checks remain enabled. Internal Auth/API traffic stays on the Docker network; external network policy is unchanged. No public tunnel or production deployment is created.

Start the existing backend with `edge-runtime` added to the exclusion list, then:

```sh
npm run cloud:edge:prepare
npm run cloud:edge:start
npm run test:edge:gateway
npm run test:services
npm run test:erasure
```

In this workspace prepend `SUPABASE_BIN=/workspace/tools/supabase` to commands that use the CLI, and `DENO_DIR=/workspace/.deno-cache` to Deno checks. This setup is specific to project `kitchen-overiew`. The runtime is named `kitchen_cloud_edge`; after rebundling, use `docker restart kitchen_cloud_edge`. Do not run ordinary `supabase functions serve` simultaneously: it would compete for the gateway's runtime address. To remove only this development runtime, run `docker rm -f kitchen_cloud_edge`; database/storage volumes are unaffected. Generated `.cloud-edge/` bundles are ignored by Git.

The sample REWE eBon is readable but owner-protected. Validation now accepts PDFs that open without a password and rejects those requiring an opening password. Only fictional reconstructed fixtures are committed. Text extraction preserved all 33 priced labels in the private sample; this is not evidence of automatic grocery interpretation.

## Meal suggestions

Apply all migrations through 015 and serve Edge Functions. Configure `OPENAI_API_KEY` and `OPENAI_MEAL_MODEL` only in an ignored server environment file passed to `supabase functions serve --env-file /path/to/server.env`. Select/evaluate a model that supports Responses structured outputs before claiming recipe quality. No default model or credentials are supplied. Without both values, generation returns `MEALS_NOT_CONFIGURED`. `store:false` is set on requests; this is not a promise of zero provider retention.

Save dietary choices, exclusions and servings in Recipes. Optional staple assumptions are edited in Kitchen's product catalogue, including products with no batch. Suggestions display measured stock separately from shortages and assumptions. Refresh before relying on a saved suggestion. No suggestion creates or consumes stock. Deterministic domain/database tests pass; live generation and device validation remain pending.

## Record cooking

In Recipes, open **Review actual cooking usage** on a saved recipe, or **Record a meal manually / recover cooking**. Review actual quantities and batch allocations; the proposal uses usable batches with earliest known expiry first. Enter any amount used outside tracked inventory and explicitly confirm it. Tracked plus untracked must equal actual usage. Press **Cooked — confirm actual usage** once ready.

A lost response is reconciled using **Retry pending cooking confirmation**, including after restarting the app. **Record another meal** starts a distinct cooking event. History retains untracked usage without stock movements. No OpenAI key is needed for manual inventory, manual receipt confirmation, or manual cooking. Database atomicity, isolation and concurrency checks pass; device acceptance is incomplete.

## Shopping

Apply migration 009. Add/edit Shopping items and mark purchases complete; this never changes Kitchen stock. From a saved recipe, choose **Review shopping shortages** and explicitly add missing ingredients. Repeating an import keeps the existing item (including edits/completion); adjust it in Shopping when needed. Removed items can be shown and restored. Lost responses have a pending-change retry action.

## Weekly planning

Apply migration 202610250010. In Planner, add a manual meal or use **Schedule this meal** from a saved recipe. Choose date, meal slot and servings. Plans can be rescheduled, cancelled and restored without changing stock.

Choose **Review actual cooking usage** when you actually cook. Review the batch allocations and any explicitly untracked amounts before confirmation. If serving changes require fractional items or repeating decimals, choose the manual-quantity review and decide actual usage. The plan is marked cooked only with the successful stock transaction; retries cannot cook it twice. Create another plan for another cooking event.

## Account deletion

Apply migrations through 015 and serve Edge Functions. Open **Account settings**, enter the current password and type **DELETE MY ACCOUNT**. This permanently deletes the sole owner's private PDFs, household data and Auth account. Preparation freezes the kitchen; interrupted deletion must be resumed from Account, signing in again if needed. Pending drafts on the requesting device are cleared before server deletion.

Local disposable-account integration and concurrency tests pass. Native UI and deployed runtime validation remain open. The cloud runs both handler tests and real runtime integration through the compatibility setup above. See [release readiness](docs/RELEASE_READINESS.md).

### Receipt processing tests without paid model calls

`npm run test:handlers` now includes receipt processing using a test-only injected provider with real local Auth/Storage/database services. To run the same mocked workflow inside real Edge workers, prepare/start with the explicit `--test-fixtures` flag, then run:

```sh
FUNCTIONS_TEST_URL=http://127.0.0.1:54321/functions/v1 npm run test:receipt-processing
```

The extra `parse-receipt-fixture` route requires normal JWT and user checks and is absent from normal startup. It is not a production parsing endpoint. Restart without `--test-fixtures` afterward. CI runs this fixture mode without live model keys.

## Compact interface and browser checks

Kitchen uses searchable ingredient rows. On wide screens, select a row to edit beside the list; on phones, tap it to open the detail screen. Use the quantity/location/expiry controls for batch changes, **More batch actions** for waste/removal, and **Edit product** for the selected ingredient's name, aliases and staple preference. Stock changes still require confirmation. Storage filters and the catalogue are under **Filters & kitchen settings**.

Shopping has a list/editor layout on desktop; Planner uses responsive day columns. Product/location selectors are searchable, recipe preferences and steps expand on demand, and receipt review keeps unresolved values and warnings visible.

`npm run test:ui` runs Chromium against the local test Supabase instance with disposable users and inventory. It requires the Supabase CLI (`SUPABASE_BIN` can select its path), a running local test backend (the cloud setup is sufficient), Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium`), and free port 8091. `playwright-core` is a development-only dependency and does not download a browser. The script starts/stops Expo, checks desktop/mobile-web interactions and saves fictional-data screenshots in ignored `.ui-artifacts/`; it removes its own test household through account erasure. It does not call AI or touch a hosted project. Use the documented cloud Expo cache environment overrides when needed.

These checks do not replace physical Android, TalkBack, enlarged-font or keyboard acceptance testing.
