/*
# Add ai_parse_usage table for per-user daily rate limiting

1. Plain-English explanation
   The AI invoice parser is limited to 40 uses per user per day to protect
   the API key from abuse. This table records one row per AI parse so the
   edge function can count a user's uses for today and refuse when the
   limit is reached.

2. New Tables
   - `ai_parse_usage`
     - `id` (uuid, primary key, auto-generated)
     - `user_id` (uuid, the signed-in user who triggered the parse)
     - `created_at` (timestamp, when the parse happened)
     - `lang` (text, language used for the parse)

3. Security
   - RLS enabled: users can see only their own usage rows.
   - The edge function inserts with the service role; the frontend never
     needs to write here directly.
*/

CREATE TABLE IF NOT EXISTS ai_parse_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  lang text NOT NULL DEFAULT 'en'
);

CREATE INDEX IF NOT EXISTS idx_ai_parse_usage_user_created
  ON ai_parse_usage (user_id, created_at);

ALTER TABLE ai_parse_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_parse_usage" ON ai_parse_usage;
CREATE POLICY "select_own_ai_parse_usage" ON ai_parse_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ai_parse_usage" ON ai_parse_usage;
CREATE POLICY "insert_own_ai_parse_usage" ON ai_parse_usage
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
