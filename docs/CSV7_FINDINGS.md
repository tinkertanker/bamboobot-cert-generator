# CSV7 dispositions

Source: `6ea9eb4c-tinkertanker-agent-findings-7.csv`, 21 findings against
`d9cead1e7b09a72284dd828594416443d8f7c3a9`, inspected on 27 October 2026.
Scanner descriptions are claims, not implementation requirements. Rows with a
shared owner are fixed together; distinct source IDs remain below.

| Row | Source ID | Disposition and evidence |
| --- | --- | --- |
| 1 | f5b5863a-be88-4bdf-ad42-1b71f70c481b | Fixed. Generic Node cleanup skips `agent_jobs`; disposable-files regression preserves another owner's sample. Workers agent keys are outside the generic generated prefix. |
| 2 | deba0591-f390-4335-9c75-f7cec127b911 | Fixed with 11. Progressive POST reserves one daily batch before creating work, on both runtimes. Reads and controls are not charged. As with ordinary generation, admission attempts remain charged on later failure. |
| 3 | b5ee015f-2648-425a-8cc3-955857c3b4d8 | Fixed after review corrections. Create/import share conditional SQLite/D1 capacity admission. Import confirmation now compares complete JSON payloads at both the previous-record precheck and concurrent-loser path; conflicting same-ID batches reject before writes. Equivalent copies count once, and partial retries still confirm saved payloads, including generated display-name suffixes. Cycle five's false import acknowledgement and browser-copy deletion remain documented in its immutable NON-CLEAN checkpoint. |
| 4 | 960588b7-3883-4b24-b9a3-f9f6f80d9dde | Fixed. Project save/import and load reject malformed numeric layouts; preview fitting rejects nonfinite/unsupported bounds and caps search iterations. |
| 5 | 83d89c53-c116-4e60-9e5c-24875f4ecdbe | Fixed. Node and D1 email admission resolve effective environment/manual tiers on every admission. Real D1 regression denies a revoked environment admin and leaves its count unchanged. No automatic tier rewrite is needed for this authorisation decision. |
| 6 | 75340ec8-944f-4d63-920c-2a317ee5f777 | Fixed with 14. Shared ellipsis search measures logarithmically many prefixes. The original 2,000-character example processes 2,010,963 glyphs; regression requires the same output under a 100,000-glyph budget. |
| 7 | 712cf837-2d80-49e5-a42b-49a8f89eeb47 | Fixed after independent review challenged deferral. Unknown records are copied and verified in a quarantine namespace before active originals are removed. Storage-backed editor features cannot mount until ownership preparation succeeds; storage failures block the editor. Quarantines are excluded from restoration/import/queue readers and hidden from generic Dev Mode inspection/cleanup. No arbitrary-account recovery/adoption is offered. Ownership-verified recovery remains future work, not a reason to keep disclosing data. |
| 8 | 6c2f3bd9-d20b-4347-ae82-3b872e63b497 | Fixed with 10. Original infinite bound exceeded a 3-second disposable-process timeout. Numeric admission and derived-size guards now reject it before measurement; bounded search cannot stall. |
| 9 | 6bc425f1-a835-41e7-821a-00610ecca7ab | Fixed for the reported missing browser guard. Browser conversion now uses the same pixel and PNG-structure checks as server/agent uploads, including URL-fetched image fallbacks. This is not a general decoder CPU/memory sandbox. |
| 10 | 5ecd51e3-890c-48a1-9a72-95317b4cef80 | Fixed with 8 in shared PDF layout and the rebuilt browser worker; imported invalid sizes are rejected before preview/generation. |
| 11 | 5a7603fa-5d3a-4b55-945a-5d637a154bc2 | Fixed with 2. Conditional `updateMany` ties quota, stored tier/source and accounting epoch to one increment. Real D1 admits exactly one of eight requests for the last free-tier batch. |
| 12 | 512dbb47-cabe-49a9-a200-522e7b95e710 | Mitigated at the reported entry. Failed image conversion no longer forwards original bytes as a PDF. The dependency's unbounded cross-reference parser itself is not patched; general parser budgets remain deferred. |
| 13 | 1a192ade-6a60-4b7b-9130-55501903599b | Fixed. Ordinary-admin mutation includes a database target-tier predicate and returns conflict if the target is no longer free/plus. A promoted target is preserved in real D1. |
| 14 | 17b7e6e0-588a-4ccc-b411-857ef6ddf3e1 | Fixed with 6. Preview uses the shared bounded ellipsis search; project/table field-length bounds also apply before preview. |
| 15 | 0cfc2c31-ec5a-4ec0-b4b9-638464784420 | Mitigated at the reported entry. Browser URL resolution rejects protocol-relative and backslash-based cross-origin template URLs. General PDF stream/object-count budgets are not implemented; same-origin/blobs remain trusted template sources. |
| 16 | b7a4a35f-84fa-4262-8794-5776eece755d | Fixed with 21. Table parsing checks aggregate cells before rectangular object allocation and shows a recoverable error while preserving the last accepted table, input and saved project. Limits: 5,000 rows, 100 columns, 100,000 cells, 1,000,000 characters, 2,000 characters per field. |
| 17 | ab3627bd-fdaa-455d-abab-122ddc4c00a7 | Fixed for the reported metadata loop. The shared PNG guard validates chunk boundaries and every terminator searched by UPNG's tEXt/iTXt paths before embedding. |
| 18 | 55010161-1fde-4ab0-b75a-9d50407d46b7 | Fixed. Reject acTL/fcTL/fdAT before PNG frame expansion, including browser uploads. |
| 19 | 48d92975-c56a-4c58-b42d-d66d788362ab | Mitigated. Explicit atomic admission rejection and concurrent duplicate losers reclaim their own staged R2 keys; pre-admission put failures also clean up. Ambiguous D1 outcomes preserve possibly committed payloads for existing expiry. A durable pre-upload staging reservation remains deferred; this does not claim an absolute staged-byte cap. |
| 20 | 34356e81-c339-4591-bef6-389be05f79c3 | Fixed. Shared PNG guard requires exactly one first IHDR and rejects replacement headers before allocations. |
| 21 | 0f15adab-8df9-425d-a698-67a7f3f739a5 | Fixed with 16. Project save/import and restoration validate cells and expanded text before nested row-string construction, including sparse rows. |

## Scope and residual risk

No database migration, deployment, live email, or shared-data write is part of
this change. Independent review also found a 65-byte PNG whose malformed Huffman
table hangs UPNG despite valid dimensions. The shared guard now validates all IDAT
data with Pako 3's zlib state machine, discards output in 64KiB chunks, requires
complete input and exactly the declared scanline size (including Adam7), and caps
scanlines at 256MiB. Pixel/frame/metadata guards still apply. This is bounded
validation, not a general decoder/process sandbox.

Rows **12, 15 and 19 remain mitigated**, not fully fixed. A malicious PDF that
reaches a same-origin/blob template source can still exercise unbounded xref or
decoded-object parsing; no remaining normal-image-upload entrance was demonstrated.
The final review cycle also closes rejected-session/project restoration paths:
programmatic parsing rejects rather than resolving successfully, and project
identity, positions and autosave follow accepted table data. Invalid working
sessions fall back to the saved project. Combined real-hook/localStorage tests
verify Alice's saved rows survive both startup and a rejected Bob project load.
Column headers share the parser's 2,000-character limit. Atomic insertion binds
Date values through Prisma, preserving native SQLite/D1 timestamp representations;
real create/update/list/reload route tests cover both runtimes. Quarantine IDs use
the existing UUID library's getRandomValues fallback on non-secure HTTP contexts.

R2 staging remains outside durable byte accounting until admission: crashes,
ambiguous database outcomes or failed cleanup can retain objects until the existing
24-hour, paginated sweep. No attacker-triggerable platform failure was demonstrated.
PDF parser budgets, ownership-verified quarantine recovery and durable staged-byte
accounting remain explicit follow-ups in `TODO.md`.

## Fourth-cycle corrections

Late host review superseded the two clean third-cycle receipts with four reproduced
regressions. Work stopped before merge; the user explicitly authorised one additional
fix/review cycle. The blocked checkpoint and reproduction evidence remain preserved.

- Rows 16/21: restoring a valid saved project had allowed session autosave to erase
  the rejected working session. Rejected sessions now get a verified copy in the
  opaque quarantine before fallback; failed archive writes or verification pause
  session autosave, including after later manual saves. Saved-project autosave
  remains available. Recovery still requires ownership verification.
- Row 7: Dev Mode cleanup now preserves the ownership marker, so unrelated cleanup
  cannot make same-account projects appear unowned on reload.
- Row 3: create/import reject empty, whitespace-only and overlong replay IDs rather
  than deduplicating unrelated payloads or truncating identities. Successful POST
  replays return 200; only new durable inserts return 201.
- Rows 16/21: bounded table parsing no longer waits 50ms on an initial large edit.
  The controlled input updates immediately, and an older delayed paste cannot
  overwrite a newer accepted edit.

Actual hooks/storage/autosave and native SQLite tests failed before these fixes.
SQLite and D1 route regressions verify rejection without persistence, valid replay
acknowledgement and distinct payload reloads. These corrections require fresh
exact-head review and normal landing gates; earlier clean receipts are not clearance.

## Fifth-cycle corrections

Cycle four stopped with two independently reproduced Required defects. Its immutable
NON-CLEAN checkpoint remains preserved. The user explicitly authorised a fifth
correction/review cycle, also covering the subsequent corrupt-session host finding.

- Rows 4/16/21: position, email and private-asset normalisation now prepare values
  before table acceptance. Only after parsing succeeds are prepared values and
  project identity committed. Normal JSON imports with malformed colour or asset
  metadata reject without replacing the current project's rows, positions or session
  through autosave. Rejected table parsing still preserves the prior state.
- Row 3: POST acknowledges an existing client ID only when the trimmed name and
  semantic JSON data match. Object key order is irrelevant; different values,
  value types or array order return 409 without mutation, including concurrent
  conflicting submissions. Historical import replay semantics remain unchanged.
- Rows 16/21: corrupt JSON, invalid session shapes and invalid timestamps preserve
  raw bytes in verified quarantine before fallback; archive write/verification
  failures keep session autosave blocked. An invalid date is not evidence of expiry.

The actual persistence contracts failed before correction and pass afterwards on
combined hooks/localStorage/autosave and native SQLite/D1 routes. The total remains
five cycles, not a reset. Fresh exact-head independent review and supported normal
landing gates are still required; no policy override, deployment or shared-data
write is part of these fixes. Rows 12/15/19 retain their mitigated classifications.

## Sixth-cycle import correction

The second fifth-cycle audit found a remaining Required defect: import acknowledged
a different payload with the same client ID after losing atomic admission, allowing
browser migration to delete its unsaved copy. Exact-base concurrency/batch controls
persisted both payloads; the new loser-discard path was a regression, while the
sequential key-only precheck was historical. Both fifth-cycle receipts and red
evidence remain immutable. The user explicitly authorised this sixth cycle.

Import now returns 409 without acknowledging the conflicting ID at both paths.
Within a batch, conflicting duplicate IDs reject before any write, and equivalent
duplicates count once against remaining capacity. Comparison uses JSON-normalised
payloads, not generated display names: object key order is irrelevant, but changed
values, types, names or array order conflict. Previously saved partial imports and
duplicate-name suffixes remain replayable. Non-success responses preserve browser
copies through the existing migration hook; no deletion or quota policy is relaxed.

Native SQLite/D1 route and real migration-hook regressions failed before this fix.
The old D1 test incorrectly accepted six different payloads under one ID; it now
tests identical replay separately from conflicting imports and asserts durable
winner content. The mock-only precheck fixture now supplies stored payload data;
real route/database coverage supplies the persistence proof. No unrelated tests
were deleted or consolidated. Actual total: six cycles, without a count reset.
Fresh exact-head review and supported landing gates remain required; no deployment
or shared-data mutation is authorised. Rows 12/15/19 remain mitigated.

## Seventh-cycle recovery-copy correction

After both sixth-cycle audits were clean, host review reproduced another storage
regression: without a saved project, rejected active session bytes remain in place,
so every reload created another permanent quarantine copy. The real startup hook
regression fails on the second mount with two identical archives instead of one.

Session archival now reuses an existing quarantine value only after reading and
matching its complete bytes. The active original remains untouched; changed bytes
still get a separate verified copy. This avoids a new deletion or cross-tab removal
race, and an existing verified copy works when storage cannot grow. Enumeration,
read, write and verification failures still fail closed and block session autosave.
The startup regression exercises repeated mounts without any saved project, changed
session bytes, quota exhaustion and enumeration failure. Previous saved-project and
archive-failure contracts remain unchanged.

The user explicitly approved as-needed further review cycles. The cumulative count
is seven, not a reset; sixth-cycle reports remain immutable but no longer clear the
new candidate. Fresh exact-head independent review and normal host gates still apply.
No deployment, installation, shared-data write or unrelated test cleanup is included.

## Row 19 follow-up: durable payload reservations

`0007_email_payload_reservations.sql` and the Workers email queue reserve the full
UTF-8 JSON size (including base64 expansion, message and metadata) before any R2
write. A single native D1 statement enforces the existing policy's queue, owner and
global byte limits, and active-per-owner/global counts for concurrent staging.
All reservation states count towards bytes, even after expiry or failed deletion.
Admission changes the reservation and email ledger in the same native atomic batch;
daily recipient quota and its existing refund rules remain separate.

Payload keys under `mail-payload/v2/` are first created as empty placeholders, once
only. After all placeholders exist, the writer checks its live reservation and uses
If-Match for payload replacement. Cleanup first fences admission in D1, then deletes
all reserved keys, then releases the charge. A late payload write cannot recreate a
deleted placeholder. A late placeholder creation can leave only a zero-byte object,
which the existing 24-hour paginated sweep collects. Tokens/keys are never reused.
This relies on R2's [atomic conditional writes and strong consistency](https://developers.cloudflare.com/r2/reference/consistency/),
not a timeout assumption about when in-flight requests must finish. The two write
phases are separated by one second for R2's per-key write rate limit; this adds a
second per submission, not per recipient, plus one extra R2 write per recipient.
The supported 500-recipient case requires Workers Paid's internal subrequest budget.

The existing minute cron reconciles at most ten reservations per invocation, with
at most 500 keys per reservation. Unadmitted staging expires after 30 minutes.
Definitive rejection/duplicate losers attempt immediate cleanup; failed operations
remain charged and retry. Unknown admission responses preserve committed payloads;
uncommitted reservations become reclaimable at expiry. Admitted payloads stay charged
until their job/submission is removed and R2 deletion succeeds, including terminal
queues and owner deletion. Persistent storage outages therefore fail closed with
429 capacity errors rather than silently releasing occupied storage. Inspect
reservation state/bytes/expiry and the cleanup-failed logs when capacity stays full.

**Rollout is not performed by this change.** This is a Workers-only additive D1
migration; Node/SQLite email handling is unchanged. Under separate approval, pause
new mail ingestion, drain existing dispatches and in-flight old-code requests,
apply migration 0007, deploy the matching code, and resume ingestion. The new trigger
rejects old-code admission without a reservation; do not run mixed writers. Legacy
payloads/debris are not retroactively measured: retain the existing reference-aware
24-hour sweep and verify the old prefix is drained before claiming a bucket-wide
cap. The new reservation bound covers v2 payloads, not previews or unrelated files.
For rollback, pause ingestion and drain/reconcile v2 reservations before reverting
code; removing the admission trigger needs explicit migration approval. Keep the
reservation table/evidence until all charged objects have been accounted for. Never
delete ledger rows to recover capacity without confirmed fenced R2 deletion.

Local Miniflare D1/R2 tests exercise UTF-8/base64 boundaries, concurrent quota and
duplicate admission, partial writes, failed deletes, lost D1 responses, and cleanup
interleaved before placeholder, payload and admission commits. Remote storage and
production migration validation remain outside this change's authority.
