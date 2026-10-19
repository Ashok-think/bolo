# P0 audit and test results

## Audit before changes

Reviewed the uploaded Bolt export's screens, voice capture/playback, rule and AI parsers, shared provider code, authentication/demo hooks, invoice RPC/public lookup, QR/UPI, sharing, trust/statistics, PDF path, styles and migrations against the GitHub baseline. Kept the existing stack and Bolt Database connection. The uploaded screenshot shows an empty Talk draft and Paused status after a book sentence.

Concrete faults found: unguarded `numbers[1].index` access for single-number segments; busy operations with no reliable speech cancellation; AI given a draft already containing the same new utterance; 15-second conversation provider timeout vs a five-second client deadline; success returning null from demo sign-in; untracked customer/advance/notes edits in Review; shared demo sample phones; hard-coded non-Bolt WhatsApp invoice URL. QR generation and the original batched RPC already existed.

## Automated (passed locally)

- `npm test`: **23 tests passed**. Includes the four requested language examples, Indian grouping/high price, single-number crash, customer-name safety, inline advance, the exact reported book phrase, provider 429 fallback, abort during provider JSON parsing, QR PNG generation, 2-second pause, 3.5-second silence, interim replacement/restart accumulation, cancel-without-submission, finishing phrases, speech cancellation without browser callbacks, no matching local voice, and mic/speech exclusion.
- `npm run test:parser`: **all five original parser tests passed**.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed** (existing large-chunk and outdated Browserslist advisories).
- `deno check` on `parse-invoice`, `converse`, `speak-reply`, `ai-health`: **passed**.
- `git diff --check`: **passed**.

| Requested acceptance | Result |
|---|---|
| English Ravi: 750 / 300 / 450 | Parser test passed |
| Hindi Ravi: 750 / 300 / 450 | Parser test passed |
| Telugu Ravi: 600 / 300 / 300 | Parser test passed |
| Mixed Ravi: 750 / 300 / 450 | Parser test passed |
| Two-second speech pause survives | Fake recognition/clock test passed; real device pending |
| AI off: rules and typing | Rule tests pass without any provider; full Bolt UI flow pending |
| Review within 300ms; QR on detail/public page at 390px | Synchronous rule routing implemented; real UI timing/mobile visual and database round trip NOT measured |
| Close stops speaking and releases microphone | Cancellation/lifecycle unit tests pass; physical mic and speaker pending |

## Not claimed as tested

No new migrations were run on the live Bolt database. No live data was deleted. Gemini key validity, quota/model access, real generated audio, native Hindi/Telugu recognition accuracy, iPhone/Android autoplay, actual invoice saving/idempotent retries in Bolt Database, public-token authorization and QR display at 390px still require deployment and phone acceptance tests. Migrations were source-reviewed; no PostgreSQL runtime was available to execute them here. Additional languages are not advertised as acceptance-tested.

The new GitHub workflow runs Node tests, typecheck/build and Deno checks on the PR. Review its actual CI result before merging. Merge/publish/deploy are intentionally left to the user's after-ChatGPT checklist.

## Manual phone checklist after Bolt deployment

1. Open the real Bolt preview/live HTTPS URL; hard-refresh and allow the mic.
2. Check AI, select Gemini voice and Test voice; confirm the diagnostic says Gemini played and you hear it. Test the browser voice fallback separately.
3. Test understanding in English/Hindi/Telugu/mixed text with the expected amounts above.
4. Speak the same examples, pause two seconds in the middle, edit a live word, press Done, and verify the final bill. Close and reopen while a reply is playing.
5. Repeat with provider keys disabled in Bolt: typing and rule-based review must stay usable.
6. Create a disposable invoice with balance; double tap Create; confirm only one invoice, QR, UPI amount and `/i/:token` in an incognito window. Check at 390px width.
7. Use Clear demo values only in the disposable shared demo account. Confirm zero invoices/customers and reset demo settings.

## Rollout review correction

Fixed a malformed SQL header missed by frontend CI; added PostgreSQL grammar parsing and a top-level additive-operation allowlist to CI. Invoice creation now uses a separate `create_invoice_batched_v2` RPC, preserving the published client's original RPC. Both migrations parse locally; 23 unit tests, 5 parser checks, typecheck and build pass again. No migration, demo reset or live publication has been performed by this review. SQL grammar checks do not execute PL/pgSQL or prove runtime database behavior. Deploy through the original Bolt project from GitHub, not a ZIP.
