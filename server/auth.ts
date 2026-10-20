import { createClient } from "@supabase/supabase-js";

/**
 * Lets a request through only with a valid Supabase session of a @flitsdigital.nl account.
 * Returns an error response to send back, or null when the caller may continue.
 */
export async function requireTeamMember(request: Request): Promise<Response | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Niet ingelogd." }, { status: 401 });
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Supabase is niet ingesteld op de server." }, { status: 500 });
  // getUser checks the token with Supabase Auth itself, so revoked or expired sessions are refused.
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Sessie verlopen; log opnieuw in." }, { status: 401 });
  if (!data.user.email?.toLowerCase().endsWith("@flitsdigital.nl")) return Response.json({ error: "Geen toegang." }, { status: 403 });
  return null;
}
