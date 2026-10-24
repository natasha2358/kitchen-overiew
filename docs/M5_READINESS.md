# Readiness for M5: receipt confirmation

M5 has not started. Preparation targets confirmation of **manually reviewed** receipts; it does not claim automatic extraction or supermarket-format coverage. Testing remains paused by explicit user instruction.

## Implemented prerequisites

- Authenticated household ownership, same-household foreign keys and protected stock writes.
- Decimal-string quantity contracts, deterministic conversions and atomic inventory RPCs.
- Verified PDF identity, canonical duplicate imports and revision-protected receipt review.
- Client review edits remain intact when query data refreshes. Explicit reload replaces local edits; saves use the revision on which those edits were based.
- Review feedback identifies malformed values and incompatible product units. This feedback is not a substitute for validation in the future confirmation RPC.

## Required verification before an M5 readiness claim

- Auth, Storage and API services have started, and migration 004 is applied. Edge runtime still needs working container DNS for its bootstrap dependencies; it is currently excluded. Full service integration remains unverified.
- `npm run test:db`: household isolation, transactional stock changes, concurrency, receipt ownership and source preservation.
- `npm run test:auth`: signup, email verification, login, recovery and logout.
- `npm run test:services`: private PDF access, immutable uploads, server verification, concurrent hash deduplication and unchanged stock.
- Client/Edge checks and Android manual review journey, including interrupted uploads and stale reviews.

These checks remain unrun while testing is paused. An applied migration or successful compilation alone does not satisfy them.

## M5 implementation boundary

Implement confirmation as one authorized PostgreSQL transaction, not a loop of client-side inventory calls. The future request carries receipt ID, reviewed revision, operation ID and acknowledgement of any possible-duplicate warning.

The transaction must lock the canonical receipt, return an existing confirmation before rejecting a retry for an old revision, validate every included line and its household references, convert only compatible units, create distinct batches and movements, and persist the result atomically. Reject empty selections, unresolved products/locations/quantities, incompatible units and stale edits without partial writes. The same receipt cannot be confirmed again even with a different operation ID.

M5 still needs versioned schema changes for confirmation state/result, receipt-line batch provenance, and merchant/receipt/date/total/currency metadata used for possible-duplicate warnings. The current hash detects identical bytes only; filename equality is not a semantic duplicate test.

Source deletion must run through an ownership-checked server workflow and retain hash, confirmation identity and ledger history. No source-deletion or confirmation operation is implemented by this preparation task.

## Separate unfinished M4 work

Real supermarket fixtures, embedded-text extraction/model selection, bounded AI calls, leases, late-result rejection and measured extraction quality remain outstanding. `parse-receipt` must continue returning its explicit configuration boundary until those prerequisites are met. No client-side model key is needed for manual review or confirmation.
