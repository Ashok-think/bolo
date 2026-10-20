# Google sign-in for the original Bolo project

Google sign-in uses the same Supabase Auth session and business lookup as email/password. A user without a business enters the existing onboarding screen. No new tables, server functions, or migrations are needed.

## Provider configuration

In the original Bolt project `https://bolt.new/~/sb1-sntfdm9s`, open **Database → Authentication → Continue with Google**. Enable Google Sign-in and enter the **Google Client ID** and **Google OAuth Client Secret** in those fields, then save. The provider was already enabled when checked on 2026-10-20; both credential fields were populated. Their validity still needs a real Google sign-in test.

Do not put the secret in frontend code, a `VITE_` variable, a chat message, or a generic server-function secret. The Google OAuth credentials are separate from `GEMINI_API_KEY`.

Google Cloud → Google Auth Platform → Clients → your **Web application** OAuth client:

| Field | Exact value |
| --- | --- |
| Authorized JavaScript origins | `https://bolo-mobile-invoice-pi0p.bolt.host` |
| Authorized redirect URIs | `https://xtoxvpecffhfvssxiffu.supabase.co/auth/v1/callback` |

These match the exact values displayed by Bolt's Google Provider Settings. The JavaScript origin has no trailing slash or path. The redirect URI is the backend callback, not the Bolt editor URL.

The auth service must allow returning to `https://bolo-mobile-invoice-pi0p.bolt.host/`. The button sets this from the current app origin. Keep this published URL as the auth Site URL/allowed redirect URL if configuring redirects separately. If Google Cloud Audience is in Testing, add your intended testers there; switch the OAuth app to Production when ready for general sign-in.

## Verification

1. Run `npm run typecheck`, `npm test`, `npm run test:parser`, and `npm run build`.
2. Check both Sign In and Sign Up tabs show Continue with Google, email/password and Try demo.
3. Google blocks embedded iframes. The button explains this inside Bolt preview; test actual OAuth on the published app in a full browser tab after the agreed publish gate passes.
4. Complete Google sign-in with a new account: existing App routing should show onboarding because it has no business yet. Finish onboarding, sign out, and verify a returning Google user reaches their business.
5. Test email/password and Try demo separately. Cancel Google sign-in and verify email/password remains available.

Official reference: https://support.bolt.new/integrations/google-sso
