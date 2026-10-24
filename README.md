# Smart Kitchen

Android-first Expo application for household grocery inventory and private receipt drafts. Recipes supports configured meal suggestions; Shopping and Planner remain marked as planned. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for tested capabilities and limitations.

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

## Checks

Tests are currently paused at the user’s request. The commands below are for when testing resumes; automatic CI triggers are also paused.

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

Run `supabase functions serve` in another terminal when using receipt uploads. Both Edge Functions require JWT verification and perform their own user/ownership checks. The private `receipts` bucket is created by migration. No OpenAI credential is needed for upload verification or manual review.

`parse-receipt` currently returns `501 PARSING_NOT_CONFIGURED`. Automatic extraction is intentionally not wired to a model: real supermarket fixtures and a measured parser/model choice are missing. An OpenAI key alone will not enable it. Store any future model key only in server-side Supabase function secrets, never an `EXPO_PUBLIC_*` value. Saved manual reviews can now be confirmed into stock, with duplicate warnings and retry protection. Source PDF deletion preserves confirmation history. These flows remain unverified while tests are paused. Meal generation is available behind the configuration below. Shopping lists and weekly planning remain later work.

Additional prepared commands (execution currently paused at the user's request):

```sh
npm run test:auth       # local Mailpit email confirmation/recovery and Auth
npm run check:edge      # Edge Function TypeScript compilation
npm run test:edge       # synthetic PDF and proposal contracts
npm run test:services   # Auth, private Storage and Edge integration
```

The cloud instance now runs PostgreSQL, Auth, Storage, REST, gateway, Mailpit and metadata, with migrations 001–008 applied. Edge runtime cannot resolve `deno.land` inside its container and is excluded from the running stack. The cloud-only startup command adds `,edge-runtime` to the exclusion list above; receipt verification cannot work with that exclusion. Use Docker Desktop/overlay2 with working container DNS for the complete workflow. Full backend integration remains unverified and tests remain paused. Read `docs/IMPLEMENTATION_STATUS.md` before treating any unrun check as verified.

## Meal suggestions

Apply all migrations through 008 and serve Edge Functions. Configure `OPENAI_API_KEY` and `OPENAI_MEAL_MODEL` only in an ignored server environment file passed to `supabase functions serve --env-file /path/to/server.env`. Select/evaluate a model that supports Responses structured outputs before claiming recipe quality. No default model or credentials are supplied. Without both values, generation returns `MEALS_NOT_CONFIGURED`. `store:false` is set on requests; this is not a promise of zero provider retention.

Save dietary choices, exclusions and servings in Recipes. Optional staple assumptions are edited in Kitchen's product catalogue, including products with no batch. Suggestions display measured stock separately from shortages and assumptions. Refresh before relying on a saved suggestion. No suggestion creates or consumes stock. Tests, live generation and device validation remain pending.

## Record cooking

In Recipes, open **Review actual cooking usage** on a saved recipe, or **Record a meal manually / recover cooking**. Review actual quantities and batch allocations; the proposal uses usable batches with earliest known expiry first. Enter any amount used outside tracked inventory and explicitly confirm it. Tracked plus untracked must equal actual usage. Press **Cooked — confirm actual usage** once ready.

A lost response is reconciled using **Retry pending cooking confirmation**, including after restarting the app. **Record another meal** starts a distinct cooking event. History retains untracked usage without stock movements. No OpenAI key is needed for manual inventory, manual receipt confirmation, or manual cooking. These flows have implementation and static-check evidence only; integration/device tests are paused.
