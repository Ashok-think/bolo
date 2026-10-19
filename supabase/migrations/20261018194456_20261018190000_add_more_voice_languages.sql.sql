/*
# Add six new Indian languages for voice input

1. Purpose
   - Voice input currently supports only English, Hindi and Telugu. The
     database restricts the business language with a CHECK constraint to
     those three codes. This migration widens the allowed set so Tamil,
     Kannada, Malayalam, Marathi, Bengali and Gujarati can be saved as a
     business language.

2. Modified Tables
   - `businesses`: the `language` CHECK constraint is replaced with one
     that allows 'en', 'hi', 'te', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu'.
     Existing values remain valid; no data changes.

3. Security
   - None. Row Level Security policies are untouched; this only changes
     which values the language column accepts.

4. Notes
   - Idempotent: safe to re-run. The old constraint is dropped only if a
     constraint with that exact name exists, then the new one is created.
*/

ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_language_check;

ALTER TABLE businesses
  ADD CONSTRAINT businesses_language_check
  CHECK (language IN ('en', 'hi', 'te', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu'));