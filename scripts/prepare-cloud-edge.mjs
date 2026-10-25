// Test/development tooling: bundle official dependencies on the host, then run
// the real Supabase Edge Runtime without dependency downloads inside Docker.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
const run = promisify(execFile);
const require = createRequire(import.meta.url);
const root = resolve(".cloud-edge");
await mkdir(root, { recursive: true });
const manifest = {};
const expectedSources = JSON.parse(
  await readFile(new URL("./cloud-edge-sources.json", import.meta.url), "utf8"),
);
async function source(url) {
  const { stdout } = await run(
    "curl",
    ["--fail", "--silent", "--show-error", "--max-time", "30", url],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  manifest[url] = createHash("sha256").update(stdout).digest("hex");
  if (manifest[url] !== expectedSources[url])
    throw new Error("Unexpected dependency source checksum");
  return stdout;
}
const bootstrapUrl =
  "https://raw.githubusercontent.com/supabase/cli/v2.75.0/internal/functions/serve/templates/main.ts";
let bootstrap = await source(bootstrapUrl);
if (
  manifest[bootstrapUrl] !==
  "79aab3debf187f3694a6c331022b2b84be0c1e036b32294a3228e8c288b2a917"
)
  throw new Error("Unexpected official bootstrap checksum");
// CLI 2.75.0 only supports HS256 here, while its local Auth issues ES256.
// Preserve verification and use Auth's trusted JWKS for asymmetric tokens.
const originalVerification = "await jose.jwtVerify(jwt, secretKey);";
if (!bootstrap.includes(originalVerification))
  throw new Error("Bootstrap verification code changed");
bootstrap = bootstrap.replace(
  originalVerification,
  `
    const header = jose.decodeProtectedHeader(jwt);
    if (header.alg === "HS256") {
      await jose.jwtVerify(jwt, secretKey, { algorithms: ["HS256"] });
    } else if (header.alg === "ES256") {
      const keys = jose.createRemoteJWKSet(new URL("http://auth:9999/.well-known/jwks.json"));
      await jose.jwtVerify(jwt, keys, { algorithms: ["ES256"], audience: "authenticated" });
    } else {
      return false;
    }
`,
);
bootstrap = bootstrap.replace(
  "console.error(e);\n    return false;",
  'console.error("JWT verification failed");\n    return false;',
);
const stdBase = "https://raw.githubusercontent.com/denoland/std/0.224.0/";
const common = {
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  mainFields: ["browser", "module", "main"],
  conditions: ["browser", "import", "default"],
  external: ["node:*"],
  logLevel: "warning",
};
await mkdir(resolve(root, "main"), { recursive: true });
await build({
  ...common,
  stdin: { contents: bootstrap, loader: "ts", resolveDir: process.cwd() },
  outfile: resolve(root, "main/index.js"),
  plugins: [
    {
      name: "official-bootstrap-dependencies",
      setup(b) {
        b.onResolve(
          { filter: /^https:\/\/deno.land\/x\/jose@v4.13.1\/index.ts$/ },
          () => ({
            path: resolve(
              dirname(require.resolve("jose/package.json")),
              "dist/browser/index.js",
            ),
          }),
        );
        b.onResolve({ filter: /^https:\/\/deno.land\/std\// }, (a) => ({
          path: a.path.replace("https://deno.land/std/", stdBase),
          namespace: "official-std",
        }));
        b.onResolve({ filter: /.*/, namespace: "official-std" }, (a) => ({
          path: new URL(a.path, a.importer).href,
          namespace: "official-std",
        }));
        b.onLoad({ filter: /.*/, namespace: "official-std" }, async (a) => ({
          contents: await source(a.path),
          loader: "ts",
        }));
      },
    },
  ],
});
const config = JSON.parse(
  await readFile("supabase/functions/deno.json", "utf8"),
);
const functions = [
  "verify-receipt",
  "parse-receipt",
  "delete-receipt-source",
  "suggest-meals",
  "erase-account",
];
for (const name of functions) {
  const alias = Object.fromEntries(
    Object.keys(config.imports).map((key) => [key, key]),
  );
  // Npm packages are pinned in package-lock.json. Application entrypoints and
  // all auth checks are bundled unchanged; no alternate request handlers.
  await build({
    ...common,
    entryPoints: [`supabase/functions/${name}/index.ts`],
    outfile: resolve(root, name, "index.js"),
    alias,
  });
}
await writeFile(
  resolve(root, "sources.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Prepared official bootstrap with ES256 verification support and application bundles in .cloud-edge (ignored).",
);
