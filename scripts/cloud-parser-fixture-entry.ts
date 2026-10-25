// Explicit test-only Edge worker. Not deployed or enabled by normal startup.
import { fixtureReceiptHandler } from "./fixture-receipt-handler.ts";
Deno.serve(fixtureReceiptHandler);
