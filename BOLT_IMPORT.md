# Bolo P0 import and deployment

This is a repair of the existing React/Vite/Tailwind Bolo project. It uses the same Bolt Database and Supabase-compatible client. No database was moved or provisioned elsewhere. No production data was cleared by these source changes.

## Import into Bolt

1. Import this project ZIP (or review the `gpt-fixes` PR and import that branch). Preserve the existing Bolt Database connection. The ZIP includes only the original public frontend connection variables in `.env`; server secrets are not included. GitHub intentionally excludes `.env`.
2. Ask Bolt to apply, in order:
   - `supabase/migrations/20261019170000_p0_ai_limits_and_demo_reset.sql`
   - `supabase/migrations/20261019170100_p0_invoice_idempotency.sql`
3. Ask Bolt to deploy these FOUR server functions, including their `_shared` imports:
   - `parse-invoice`
   - `converse`
   - `speak-reply`
   - **new:** `ai-health`
4. In Bolt server secrets keep `GEMINI_API_KEY`. `GEMINI_MODEL` is optional (default `gemini-2.5-flash`). `GEMINI_TTS_MODEL` is optional (default `gemini-2.5-flash-preview-tts`; use a TTS-capable model, not the text parser model). For the fallback provider set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`. Bolt supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server. Never put these server secrets in Vite variables or GitHub.
5. Run `npm install`, `npm test`, `npm run typecheck`, and `npm run build` in Bolt. The automated checks do not replace the phone tests below.
6. Open Settings → **Check AI**. A missing migration, missing/deployed function, rejected key, unavailable model, rate limit, or timeout produces a plain diagnostic. No key is shown.
7. Settings → choose the language, **Gemini voice**, then **Test voice**. Gemini voice is opt-in; device voice is the default. The result says which voice actually played. If the browser blocked autoplay, the generated clip is cached: tap **Test voice** again, or **Play reply** in Talk to Bolo. If the device has no voice for that language, the reply stays visible as text.
8. Settings → **Test understanding** runs a five-second text-only AI attempt and shows the resulting customer, quantities, unit prices, total, advance and balance. It explicitly labels a rule-based result if AI was unavailable in this diagnostic screen; regular billing degrades silently.
9. Sign into the demo, then Settings → **Clear demo values** once if you want an empty demo. This is a new database function restricted to the `demo@bolo.app` account and its own business. It clears demo invoices/customers and resets demo business settings. It cannot clear a normal account. Sample loading remains optional; samples contain no customer phone numbers. Add a UPI ID before testing payment QR codes.
10. Once the PR checks and Bolt preview pass, publish the updated app in Bolt. GitHub source changes alone do not deploy the server functions or update the live Bolt site.

## P0 behavior

- Browser SpeechRecognition only for capture: starts on mic tap, continuous/interim results, restarts browser-ended sessions, replaces interim words, finishes after 3.5 seconds of silence, Done, or the requested finishing phrases.
- Cancel releases recognition and resolves pending speech without submitting after close. A two-second pause does not finish a turn. Language chips are locked during capture.
- The rule parser cannot crash on a single-number fragment. The reported book sentence becomes quantity 30 × unit price 500, with the customer left empty.
- English, Hindi and Telugu are the P0 selectable languages. Extra locales remain supported in the data/model hints but are withheld from the picker until their real-device recognition acceptance tests pass, as requested in the supplied specification.
- Review opens through a synchronous rule parse. AI upgrades only fields the user has not edited; re-reading invalidates older requests. High prices require confirmation again whenever items change.
- Talk to Bolo shows a usable rule draft immediately, then uses the AI's actual reply when available. A new mic tap can interrupt AI/playback rather than leave the controls stuck on Paused. Reply voice and listening never run together.
- Invoice saving remains one transactional RPC, with a synchronous double-submit guard and a reusable request ID. The migration locks business numbering and verifies customer ownership and item values.
- Payment QR uses `qrcode`, 480px PNG generation, a 240px white frame, skeleton/error states, Copy UPI link and Pay with UPI. Paid/missing-UPI states are explicit. WhatsApp links use the actual Bolt site's `/i/:token` route.
- AI parsing uses Gemini's native generateContent API with a JSON schema and low/disabled thinking where supported; fallback runs inside the shared four-second provider budget. The client still stops waiting at five seconds. Limits reserve attempts atomically: 40 per user/day, 1,000 globally/day, shared by AI operations (including voice tests). Failed attempts count toward the limit.

## Validation and remaining gates

See `docs/P0_TEST_RESULTS.md` for exact automated results and unverified live behavior. The PR is P0 only. Credit limits/promises/collections ranking, richer demo scenarios, PDF font work, PWA/business pages/CSV, and expanded Android navigation are P1 and are deferred until P0 passes real Bolt/phone acceptance tests.

Current Google reference pages checked while implementing:
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
- https://ai.google.dev/gemini-api/docs/generate-content/thinking
- https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts
