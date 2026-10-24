import pg from "pg";
import { localBackend } from "./local-backend.mjs";
import { testHouseholds } from "../tests/database/households.mjs";
import { testInventory } from "../tests/database/inventory.mjs";
import { testReceipts } from "../tests/database/receipts.mjs";
import { testConcurrency } from "../tests/database/concurrency.mjs";
import { testConfirmation } from "../tests/database/confirmation.mjs";
const db = new pg.Client({ connectionString: localBackend().DB_URL });
await db.connect();
try {
  await db.query("begin");
  const context = await testHouseholds(db);
  await testInventory(db, context);
  await testReceipts(db, context);
  await testConfirmation(db, context);
  console.log(
    "PASS household isolation, inventory transactions and rollback, receipt ownership, duplicate identity and protected review",
  );
} finally {
  await db.query("rollback");
  await db.end();
}

await testConcurrency(localBackend().DB_URL);
