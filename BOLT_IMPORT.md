# Bolo P0 import and deployment

This is a repair of the existing React/Vite/Tailwind Bolo project. It uses the same Bolt Database and Supabase-compatible client. No database was moved or provisioned elsewhere. No production data was cleared by these source changes.

## Update the ORIGINAL Bolt project from GitHub

Do not import a ZIP or create a new Bolt project. Keep https://bolt.new/~/sb1-sntfdm9s and its existing database connection. GitHub excludes `.env`; keep the original public frontend connection variables in Bolt.

1. Record the current Bolt version as a restoration point. Review and merge the P0 PR only after CI passes, then pull GitHub `main` in the existing project. Do not publish yet.
2. Before applying SQL, display and review both migrations in order:
   - `supabase/migrations/20261019170000_p0_ai_limits_and_demo_reset.sql`
   - `supabase/migrations/20261019170100_p0_invoice_idempotency.sql`
   The first defines an atomic AI quota function (40 attempts/user/day and 1,000 globally/day) and an explicitly invoked demo reset function. Defining these functions does not call them or change existing rows. The reset body contains DELETE/UPDATE, but requires an authenticated JWT for `demo@bolo.app` AND ownership of the specified business. Never invoke reset during deployment. Do not automatically run any deletion, truncation or rewrite of existing data.
   The second adds a nullable request-ID column, a unique partial index and `create_invoice_batched_v2`. It preserves the original invoice RPC and all existing rows so the currently published client continues working. It does not backfill data.
3. Apply only the reviewed additive definitions. If the database differs or a migration is already applied, stop and report rather than modifying old records or dropping functions.
4. Deploy exactly these four server functions with their `_shared` imports: `parse-invoice`, `converse`, `speak-reply`, `ai-health`.
5. Enter secrets in Bolt's server-function secrets settings, never in chat or GitHub: `GEMINI_API_KEY`; optional `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) and `GEMINI_TTS_MODEL` (default `gemini-3.8-flash-lite-tts`). Optional fallback: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Bolt supplies server `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in frontend configuration.
6. Run `npm install`, `npm test`, `npm run test:parser`, `npm run typecheck`, `npm run build`, and the SQL check from CI. Report anything unverified.
7. In preview, run Settings → Check AI (at least one provider green), then Test understanding with English, Hindi, Telugu and mixed acceptance sentences. Check customer, quantities, unit prices, totals and balance.
8. Test a two-second speaking pause, immediate Review, invoice creation and QR on invoice/public link, and Talk to Bolo without the app hearing its own reply. A real microphone and phone require manual testing; CI cannot verify them.
9. Gemini voice is OFF by default. Device voice remains the default. Test optional Gemini voice only after the core flow works; leave it off if slow or silent. Missing matching device voice leaves a visible text reply.
10. Do not clear demo data during rollout. The explicit Settings action is restricted to the demo account and its own business; it is a separate destructive operation, not a deployment step.
11. Do not Publish until preview and real-phone acceptance tests pass. Restore the recorded version if necessary. GitHub changes alone do not deploy server functions or update the live Bolt site.

## P0 behavior

- Browser SpeechRecognition only for capture: starts on mic tap, continuous/interim results, restarts browser-ended sessions, replaces interim words, finishes after 3.5 seconds of silence, Done, or the requested finishing phrases.
- Cancel releases recognition and resolves pending speech without submitting after close. A two-second pause does not finish a turn. Language chips are locked during capture.
- The rule parser cannot crash on a single-number fragment. The reported book sentence becomes quantity 30 × unit price 500, with the customer left empty.
- English, Hindi and Telugu are the P0 selectable languages. Extra locales remain supported in the data/model hints but are withheld from the picker until their real-device recognition acceptance tests pass, as requested in the supplied specification.
- Review opens through a synchronous rule parse. AI upgrades only fields the user has not edited; re-reading invalidates older requests. High prices require confirmation again whenever items change.
- Talk to Bolo shows a usable rule draft immediately, then uses the AI's actual reply when available. A new mic tap can interrupt AI/playback rather than leave the controls stuck on Paused. Reply voice and listening never run together.
- Invoice saving remains one transactional RPC, with a synchronous double-submit guard and a reusable request ID. The migration locks business numbering and verifies customer ownership and item values.
- Payment QR uses `qrcode`, 480px PNG generation, a 240px white frame, skeleton/error states, Copy UPI link and Pay with UPI. Paid/missing-UPI states are explicit. WhatsApp links use the actual Bolt site's `/i/:token` route.
- Normal parsing and Talk use Gemini first, then the compatible API. An explicit Review Re-read selects the compatible API directly within the same five-second deadline. AI parsing uses Gemini's native generateContent API with a JSON schema and low/disabled thinking where supported; fallback runs inside the shared four-second provider budget. The client still stops waiting at five seconds. App daily caps have been removed at the owner's request. AI endpoints still require an authenticated user, but do not call reserve_ai_call or consume the old app allowance. External provider quotas still apply. The historical SQL quota function and usage records are preserved and unused.

## Validation and remaining gates

See `docs/P0_TEST_RESULTS.md` for exact automated results and unverified live behavior. The PR is P0 only. Credit limits/promises/collections ranking, richer demo scenarios, PDF font work, PWA/business pages/CSV, and expanded Android navigation are P1 and are deferred until P0 passes real Bolt/phone acceptance tests.

Current Google reference pages checked while implementing:
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
- https://ai.google.dev/gemini-api/docs/generate-content/thinking
- https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts

## Provider routing correction (source update)

- Normal speech parsing and Talk to Bolo: Gemini first, then the configured OpenAI-compatible provider.
- Review → Re-read: compatible provider directly, using the existing AI_BASE_URL / AI_API_KEY / AI_MODEL. It receives browser transcript TEXT only.
- Qwen3.8 Omni text support uses `modalities: ["text"]`, JSON mode, `reasoning_effort: "none"`, and non-streamed responses. Set `AI_MODEL=qwen3.8-omni-flash` only when your provider actually serves that exact ID; do not overwrite a working model on an unverified proxy.
- Reply voice is separate: GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts. This model-name setting does not fix a Gemini 429 quota response. Device voice remains the fallback/default.
- This update requires redeploying `parse-invoice` and `converse` with `_shared/providerChain.ts` after syncing source. No new migrations. Do not claim the routing change is live until deployed and tested.

## Current Gemini compatibility

New keys may not have access to legacy 2.5 models. Set GEMINI_MODEL=gemini-3.8-flash and GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts in server secrets. Gemini 3.8 Flash supports low/medium/high thinking, not minimal. The TTS helper uses Interactions, speech metadata and explicit 24kHz audio/l16 to keep the existing player valid. The diagnostic health timeout is 10 seconds; invoice parsing remains capped at 5 seconds. Optional voice generation has a 12-second client limit including authentication/network; device voice remains the fallback. Deploy all four server functions with shared imports after this source update. No migrations.

## Verified live configuration

Current working text model: GEMINI_MODEL=gemini-3.5-flash-lite (Check AI green for both providers). The helper uses minimal thinking only for documented models that support it, and low for Gemini 3.8. Current working voice: GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview (Test voice reported Gemini voice played). The 3.8 speech adapter remains available, but its live generation was unavailable with this account during testing. The legacy preview has a published November 17, 2026 shutdown date; recheck/migrate before then. Do not replace working secrets with defaults without testing.

## Remove app daily caps (2026-10-20)

Deploy parse-invoice, converse, speak-reply and ai-health with the updated shared ai.ts. No SQL migration or usage reset is required: authorizeAI authenticates but no longer calls reserve_ai_call. Historical migrations stay intact. This applies immediately to existing usage after server deployment; publishing is needed only for the clearer AI Re-read button label. Provider quotas are unaffected.
