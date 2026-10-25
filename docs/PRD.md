# Product requirements

Status: approved requirements baseline; implementation progress and verification are tracked in [Implementation status](IMPLEMENTATION_STATUS.md).
Related: [Architecture](ARCHITECTURE.md), [Roadmap](ROADMAP.md), [Contributor instructions](../AGENTS.md).

## Purpose and audience

Build an Android-first grocery inventory and AI meal suggestion app for a person managing groceries at home. Reduce manual entry from supermarket receipts, make quantities and expiry dates visible, and suggest meals that use available stock. Preserve future iOS compatibility through React Native and Expo.

The MVP serves one signed-in owner in one automatically created household. Household ownership is part of the data model now; invitations, shared access, and household switching are later work.

Success means users can import a supported receipt, correct its contents, add stock exactly once, obtain useful meal suggestions, and confirm cooking without duplicate or partial deductions. AI extraction is an editable draft, not a source of inventory truth.

## Scope and defaults

| Area | MVP decision |
| --- | --- |
| Platform | Android first; shared React Native/Expo code suitable for future iOS validation |
| Access | Supabase email/password sign-up, verification, sign-in, recovery, and sign-out |
| Connectivity | Online-first; no offline changes or synchronization queue |
| Inventory | Products, batches, remaining quantities, package metadata, storage locations, optional expiry dates |
| Receipts | User selects a supermarket PDF with the phone's document picker |
| Receipt coverage | Selected supermarket formats validated against representative fixtures; prefer embedded text extraction, with PDF vision fallback when needed |
| Meals | On-demand suggestions based on stock, quantities, expiry, servings, preferences, and optional explicitly designated pantry staples |
| Cooking | User reviews actual deductions and explicitly confirms a cooking event |
| Language and units | English interface; metric mass/volume and item counts; receipt languages defined by fixtures |
| Retention | Private PDFs retained until deleted; import identity and stock history retained after PDF deletion |

Deferred: automatic Gmail/email access, receipt camera capture, barcode scanning, universal receipt/OCR coverage, household sharing, offline editing, notifications, nutrition tracking, and iOS release certification. No microservices or separate processing platform.

## User stories and acceptance criteria

Requirement identifiers are stable and referenced by the roadmap. Each criterion must be demonstrated with a repeatable test or documented acceptance check.

### PRD-01: Account and household isolation

As an owner, I want my groceries and receipts accessible only through my account.

- Verified sign-up provisions exactly one household and owner membership, even if provisioning is retried.
- Sign-in restores the correct household; sign-out clears account-specific query data and local drafts.
- Unauthenticated requests fail; a second account cannot read or change the first household's rows, PDFs, or stock through direct API, Storage, or RPC requests.
- Failed sign-in shows an error plus retry and recovery actions. Recovery submission shows a neutral acknowledgement regardless of whether an account exists; no response exposes another account's data.

### PRD-02: Manual inventory and packages

As an owner, I want to add and correct what I actually have.

- Create a product and stock batch with a positive quantity, compatible unit, and storage location. Edit metadata, move stock, add stock, record waste, and adjust remaining stock through validated operations.
- Default locations are pantry, fridge, and freezer. Users may create and rename locations; locations with stock cannot be deleted until stock is moved.
- Distinct purchases or expiry dates can remain separate batches of the same product. The product summary totals only compatible quantities.
- Identify products using a normalized name and optional user-confirmed aliases. For matching, trim and collapse whitespace and compare without case differences while preserving readable names and original receipt labels. A confirmed alias suggests the same household product on later imports; multiple possible matches require review rather than automatic merging. No product taxonomy is required.
- Two 500 g packages produce 1,000 g of stock. Consuming 250 g leaves 750 g; package metadata is not added again or presented as an exact count of unopened packages.
- Accept grams/kilograms, millilitres/litres, and item counts. Convert only within a dimension: 0.5 kg becomes 500 g and 0.25 l becomes 250 ml. A g-to-ml conversion is rejected; an item-to-g conversion requires a confirmed per-item/package size rather than a guessed weight.
- Quantity calculations preserve decimal accuracy. Remaining stock cannot become negative; a zero balance stays available in history and is omitted from active-stock lists.
- Repeated submission of the same stock operation changes the balance only once and preserves a traceable stock movement.

### PRD-03: Locations and expiry

As an owner, I want to see where groceries are stored and which to use first.

- Filter active inventory by storage location and sort by earliest known expiry; unknown dates appear after known dates.
- Expiry is optional, displayed as unknown when absent, and stored as a calendar date.
- Show past-date and soon-expiring indicators; the default soon-expiring window is today through seven days ahead in the household timezone.
- A receipt that contains no expiry date does not cause an inferred date to be saved without user confirmation.
- Editing a batch's date or location preserves its quantity and history.

### PRD-04: PDF selection and extraction

As an owner, I want to select a receipt PDF from my phone and receive a draft of its grocery lines.

- Cancelling the document picker creates no stock. The UI distinguishes uploading, processing, ready for review, and failed states, with a retry action for recoverable failures.
- Check file type, actual file content, and configured size limits server-side. Invalid, unreadable, opening-password-protected, or over-limit PDFs fail before confirmation. Readable PDFs with owner/editing restrictions are accepted when no opening password is required.
- Prefer extracting embedded text server-side from digital PDFs where practical, then use AI to interpret and normalize receipt lines. Fixtures with usable embedded text must demonstrate this route without sending the PDF for vision processing.
- Scanned or image-only fixtures, or fixtures with unusable/incomplete embedded text, exercise PDF vision fallback. Both routes produce the same reviewable draft and validation behavior; a failed fallback leaves inventory unchanged. Record the selected route and fallback reason without logging receipt contents.
- Choose the parser and text-usability/fallback checks from real fixture results before claiming support. This is a preferred approach, not a promise that every digital PDF can use the text route.
- Preserve extracted source labels alongside proposed normalized products, purchased quantities, units, package details, and available merchant/date/receipt identifiers.
- Missing or ambiguous values are flagged for review. Discounts, totals, deposits, and non-grocery lines do not automatically become stock.
- Neither upload nor extraction changes inventory. A timeout, refusal, malformed AI result, or failed validation leaves stock unchanged.
- Each claimed supported format has sanitized fixtures covering ordinary lines, weighted goods, multipacks, decimal formats, discounts, and ambiguous text where applicable. Record which digital/scanned variants and languages were validated.
- On the fixture set, every expected grocery line is either represented correctly or explicitly flagged for correction; no silently omitted grocery lines are accepted. Do not promise universal extraction accuracy.

### PRD-05: Receipt review and confirmation

As an owner, I want to correct a draft before adding groceries.

- Show source labels beside editable product matches, quantity, unit, package information, location, and expiry.
- Allow adding missing grocery lines, excluding non-stock lines, and matching or creating a household product.
- Unresolved required quantities, units, product matches, or locations block confirmation. A blank expiry does not.
- Save reviewed drafts online so reopening an import preserves corrections. Display unsaved edits explicitly if saving fails.
- Confirm only the reviewed draft revision. Stale edits require refresh/review.
- A successful confirmation creates all selected stock batches and movements and marks the receipt confirmed in one transaction. Any failure rolls back every stock change.
- A confirmed import is read-only. Later corrections are explicit inventory adjustments, not another import confirmation.

### PRD-06: Duplicate prevention and recovery

As an owner, I want retries and duplicate PDFs to leave stock correct.

- Identical file bytes within the same household resolve to one canonical import using a server-verified hash and database uniqueness, including concurrent uploads.
- An already confirmed identical PDF cannot add stock again. An unconfirmed canonical import can be reopened or retried.
- A different PDF with matching merchant receipt identity, or suspiciously similar date/total information, produces a possible-duplicate warning. Confirmation requires explicit acknowledgement; heuristics must not silently reject a legitimate purchase.
- Repeated or simultaneous confirmations of one import produce one set of stock changes.
- Interrupted processing has a visible retry path with bounded attempts. Retrying extraction must not overwrite saved review corrections.
- Deleting the stored PDF does not remove the hash or allow a confirmed receipt to be imported again.

### PRD-07: Food preferences and meal suggestions

As an owner, I want suggestions that fit my groceries and preferences.

- Save dietary choices, excluded ingredients, and desired servings.
- Allow an optional household-level "always available" designation on a product such as salt, pepper, a spice, or oil, including a product with no stock batch. Default it to off; neither the app nor AI silently enables it. Toggling it changes no inventory balance or stock movement.
- Generate suggestions from a fresh inventory snapshot, prioritizing usable stock with earlier known expiry. Past-date batches are excluded by default.
- Present ingredients, amounts, units, servings, steps, and any missing or unresolved ingredients. Label any reliance on an "always available" ingredient as assumed availability, separate from measured stock.
- With zero tracked salt and the designation off, a recipe requiring salt shows a shortage. With it on, the same recipe may be suggested using the labeled assumption. Turning it off restores the shortage on re-evaluation. A designation never overrides an excluded ingredient.
- Validate proposed product references, units, quantities, and known preference conflicts on the server. Unknown ingredient mappings remain visibly unresolved.
- Distinguish recipes covered by measured stock from those relying on designated staples or other missing ingredients. Suggested quantities stay finite; assumed availability is never represented as an infinite balance or used to authorize a deduction.
- Generating or viewing a suggestion changes no inventory. With no stock or designated staples, show an empty-state action to add groceries. No compatible results show an action to change preferences; an AI failure shows an error and retry action.

### PRD-08: Cooking confirmation

As an owner, I want inventory to reflect what I actually used.

- Review and edit actual ingredient quantities and batch allocations before explicitly confirming "Cooked."
- Proposed allocations use earliest known expiry first, with unknown dates after known dates; users can change allocations.
- Resolve unknown conversions and product references before confirmation. Ingredients used from outside tracked inventory must be explicitly marked and produce no stock deduction.
- An "always available" designation never skips cooking review or authorizes extra stock. With 10 ml of tracked oil and 15 ml used, a request to deduct 15 ml fails; the user may instead confirm 10 ml from the batch and explicitly mark 5 ml as untracked. The balance becomes zero and the stock movement is exactly -10 ml.
- With no tracked salt, explicitly confirming its use as an untracked staple creates no salt stock movement. Tracked staple quantities follow the same expiry, availability, atomicity, and retry rules as other ingredients.
- Recheck current quantities and batch eligibility inside a transaction. Insufficient or changed stock returns a conflict without partial deductions; the user reviews a refreshed proposal.
- A successful transaction records the cooking event and all deductions together.
- Retrying one cooking confirmation deducts once. Cooking the same recipe again is a distinct event with a new operation identifier.

### PRD-09: Mobile states and privacy

As an owner, I want clear feedback and control of my receipt files.

- Complete the acceptance journey on a physical Android device with no clipped action labels at the device's enlarged text setting. Interactive controls expose accessible names to TalkBack; validation identifies the affected field and how to correct it.
- Offline mode is clearly indicated and blocks mutations and AI requests. Any in-memory data still visible is marked as potentially stale; persistence across app restarts is not promised.
- Loading and pending states prevent accidental repeated taps; database guarantees still protect repeated requests.
- Private PDFs can be deleted without reversing confirmed stock movements. A failed deletion is reported and can be retried.
- A sole owner can permanently erase their account and household after current-password verification and explicit confirmation. Freeze writes first; remove private files, household records and finally Auth identity. Interrupted deletion remains resumable. Clear pending drafts on the requesting device before server deletion.
- Before the first receipt upload, explain that extracted text is sent to OpenAI for interpretation and the PDF may be sent for vision fallback. Explain that relevant stock, staple designations, and preferences are used for meal suggestions.
- Do not expose API secrets or include receipt contents, signed URLs, or sensitive preferences in routine logs.

## Acceptance and release evidence

The Android acceptance journey is: sign in, manually add stock, select a supported PDF, correct and confirm it, attempt a duplicate import, request a meal, review actual ingredients, confirm cooking, and verify the resulting balances and history. Repeat receipt review with a text fixture and a vision-fallback fixture. Toggle a zero-stock staple, verify the suggestion's assumption label, and confirm that cooking never invents stock.

Release evidence must include the fixture coverage matrix, requirement-to-test mapping, cross-household denial tests, concurrent retry and rollback tests, and the Android journey. AI quality tests use sanitized examples and measure extraction against expected fields; normal CI uses deterministic mocked AI responses. See the [roadmap](ROADMAP.md) for milestone exit gates.

## Recorded assumptions

- One owner and one household are sufficient for the MVP; household membership remains explicit for future sharing.
- Batch quantity is authoritative. Individual open packages and post-opening shelf life are not tracked.
- Missing expiry dates remain unknown. Receipt product normalization uses names and optional aliases without a taxonomy.
- Embedded text extraction is preferred where practical; parser selection and fallback rules remain provisional until real fixtures are evaluated.
- "Always available" is an optional suggestion assumption, defaults off, and does not represent unlimited or untracked stock as a balance.
- Exact supermarket names, receipt languages, SDK versions, and AI model are selected in their implementation milestones, not guessed in this documentation task.
- PDF retention is separate from import metadata retention. Full account erasure and production privacy operations must be addressed in release readiness.

## Remaining open questions

These do not block documentation; resolve them at the named milestone before claiming implementation support.

- Which supermarkets, receipt languages, and digital/scanned variants will the initial sanitized fixture set cover? Resolve in M1.
- Which embedded-text parser works within Edge Function limits, and which fixture-based checks should trigger PDF vision fallback? Confirm parser choice, quality, latency, cost, and the provisional 10 MiB/10-page envelope in M4 using M1 fixtures.
- Which AI model, operational deadline, and household usage limits meet the measured receipt and meal requirements? Select and record them in M4/M6; validate production limits in M8.

## Authorized later phases

### PRD-L1: Shopping lists

- Maintain one household shopping list with manual items, positive decimal quantities, compatible canonical units and optional household product references.
- Edit, mark purchased/unpurchased, remove and restore items with revision checks and recoverable operation IDs. None of these actions creates inventory or stock movements.
- Review a saved recipe's measured shortages and explicitly add individual ingredients. The server recomputes usable stock; optional staple assumptions never erase a measured shortage.
- Repeated addition of the same suggestion/recipe/ingredient resolves to its existing shopping item rather than increasing its quantity. Changing requirements remains an explicit item edit.
- Unknown ingredient mappings remain named shopping items; no package or unit conversion is guessed. RLS denies another household's reads and changes.

### PRD-L2: Weekly meal planning

- View Monday–Sunday weeks using calendar dates and the household timezone for today. Schedule manual meal notes or saved recipe snapshots into breakfast/lunch/dinner/snack slots; multiple dishes per slot are allowed.
- Choose servings, edit/reschedule, cancel and restore uncooked plans. Use revision checks and persisted operation IDs for stale edits and interrupted responses.
- A plan neither reserves nor consumes stock. Start actual cooking review explicitly; only the existing atomic transaction can link a cooking event and mark the plan cooked.
- One planned meal can link to only one cooking event, even when concurrent callers submit different operation IDs. Another intentional cooking requires a new plan or standalone cooking event.
- Scale saved recipe quantities exactly for planned servings. Fractional items or values needing more than six decimal places require explicit manual quantity decisions, never silent rounding.
- Preserve cancelled/cooked history and isolate all plan and recipe references by household. Cooked plans are immutable; actual usage remains available in cooking history.
