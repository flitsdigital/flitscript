import { createClient } from "@supabase/supabase-js";

// The publishable key is meant for the browser; row level security decides what a session may read or write.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const TEAM_DOMAIN = "@flitsdigital.nl";
export const isTeamEmail = (email: string | undefined | null) => !!email && email.trim().toLowerCase().endsWith(TEAM_DOMAIN);

/** Authorization header for our own /api functions. */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}
