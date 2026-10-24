# M5 implementation and remaining verification

M5 is implemented in migration 005, the receipt review UI, and the source-deletion Edge Function. Tests remain paused at the user's request; implementation is not a passed exit gate.

## Delivered

- Optional merchant, receipt number, purchase date, total and currency are saved atomically with reviewed lines and a revision check.
- Possible duplicate receipts use normalized merchant plus receipt number, or merchant/date/total/currency. Users acknowledge the specific displayed candidate IDs; new candidates require fresh acknowledgement. Exact-byte canonical identity remains separate.
- One authorized PostgreSQL transaction locks the receipt, validates included lines and household references, resolves products, converts compatible units, creates separate batches and movements, and persists confirmation.
- Same-operation retries return the saved result. A different operation ID for an already confirmed receipt also returns that receipt's original confirmation. A changed payload cannot reuse a committed operation ID.
- Pending client confirmation requests retain their original ID and contents across interrupted responses. Confirmed reviews cannot be edited.
- Source deletion uses an ownership-checked server workflow and persistent deletion token. It retains canonical hash, line/batch provenance and ledger history. Verified replacement bytes can restore a deleted source without reopening confirmation.

## Still required

- Resolve the cloud Edge container's DNS failure or use a local Docker environment with working dependency networking. Auth, Storage, REST and PostgreSQL are running here; migration 005 is applied.
- When testing resumes, run the prepared database, Auth, Edge and Storage checks, including rollback, same-receipt concurrent confirmation, lost-response recovery, candidate acknowledgement, source replacement and cross-household denial.
- Validate the complete review/confirmation/deletion journey on Android.

Real supermarket fixtures and automatic receipt extraction remain separate unfinished M4 work. The parser still returns `PARSING_NOT_CONFIGURED`; M5 currently accepts verified PDFs reviewed manually. See [implementation status](IMPLEMENTATION_STATUS.md) for M6/M7 and measured evidence.
