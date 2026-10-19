import { supabase } from './supabase';

/**
 * Signs into a shared demo account, creating it on first use and loading
 * demo data once. Falls back with a clear error if it cannot be reached.
 */
export async function signInDemoAccount(): Promise<{ error: string | null }> {
  const email = 'demo@bolo.app';
  const password = 'bolo-demo-2026';

  // Try signing in first
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!signInError) return { error: null };

  // Account may not exist yet — create it
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError && !signUpError.message.includes('already registered')) {
    return { error: signUpError.message };
  }

  // Confirm we now have a session
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return {
      error: 'Demo sign-in is unavailable right now. Please try again.',
    };
  }

  return { error: null };
}
