import pg from "pg";
import { localBackend } from "./local-backend.mjs";
import { testHouseholds } from "../tests/database/households.mjs";
import { testInventory } from "../tests/database/inventory.mjs";
import { testReceipts } from "../tests/database/receipts.mjs";
import { testConcurrency } from "../tests/database/concurrency.mjs";
import { testConfirmation } from "../tests/database/confirmation.mjs";
import { testMeals } from "../tests/database/meals.mjs";
import { testCooking } from "../tests/database/cooking.mjs";
import { testConfirmationConcurrency } from "../tests/database/confirmation-concurrency.mjs";
import { testShopping } from "../tests/database/shopping.mjs";
import { testPlanner } from "../tests/database/planner.mjs";
const db = new pg.Client({ connectionString: localBackend().DB_URL });
await db.connect();
try {
  await db.query("begin");
  const context = await testHouseholds(db);
  await testInventory(db, context);
  await testReceipts(db, context);
  await testConfirmation(db, context);
  await testMeals(db, context);
  await testCooking(db, context);
  await testShopping(db, context);
  await testPlanner(db, context);
  console.log(
    "PASS household isolation, inventory transactions and rollback, receipt ownership, duplicate identity, protected review, shopping isolation/shortages and planning/cooking linkage",
  );
} finally {
  await db.query("rollback");
  await db.end();
}

await testConcurrency(localBackend().DB_URL);

await testConfirmationConcurrency(localBackend().DB_URL);
