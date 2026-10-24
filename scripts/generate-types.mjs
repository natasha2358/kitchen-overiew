import { execFileSync } from "node:child_process";
import { writeFileSync, renameSync } from "node:fs";
const generated = execFileSync(
  process.env.SUPABASE_BIN || "supabase",
  ["gen", "types", "typescript", "--local"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
if (!generated.includes("export type Database"))
  throw new Error("Supabase did not return database types.");
writeFileSync("src/shared/database.types.ts.tmp", generated);
renameSync("src/shared/database.types.ts.tmp", "src/shared/database.types.ts");
