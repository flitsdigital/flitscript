import type { Session } from "@supabase/supabase-js";
import { LoaderCircle, Mail } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isTeamEmail, supabase, TEAM_DOMAIN } from "../lib/supabase";
import { Button, fieldClass } from "./kit";

/** Renders `children` with the session once a @flitsdigital.nl account is signed in; otherwise the login screen. */
export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        <LoaderCircle className="animate-spin" />
      </div>
    );
  }
  if (!session) return <Login />;
  if (!isTeamEmail(session.user.email)) {
    return (
      <Centered>
        <p>
          <strong>{session.user.email}</strong> heeft geen toegang. Log in met je {TEAM_DOMAIN}-adres.
        </p>
        <Button onClick={() => void supabase.auth.signOut()}>Uitloggen</Button>
      </Centered>
    );
  }
  return <>{children(session)}</>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string }>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isTeamEmail(email)) return setState({ kind: "error", message: `Gebruik je ${TEAM_DOMAIN}-adres.` });
    setState({ kind: "sending" });
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setState(error ? { kind: "error", message: error.message } : { kind: "sent" });
  }

  return (
    <Centered>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-lg font-black text-flits">F</span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Inloggen bij Flitscript</h1>
        <p className="text-neutral-500">Je krijgt een inloglink per e-mail. Geen wachtwoord nodig.</p>
      </div>
      {state.kind === "sent" ? (
        <p className="flex items-center gap-2 rounded-lg bg-flits-soft px-3 py-2">
          <Mail size={16} /> Check je mail ({email.trim()}) en klik op de link.
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="w-full space-y-3">
          <input
            autoFocus
            type="email"
            required
            placeholder={`naam${TEAM_DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${fieldClass} h-10`}
          />
          <Button type="submit" variant="primary" className="h-10 w-full" disabled={state.kind === "sending"}>
            {state.kind === "sending" ? "Versturen…" : "Stuur inloglink"}
          </Button>
          {state.kind === "error" && <p className="text-red-600">{state.message}</p>}
        </form>
      )}
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-neutral-200">{children}</div>
    </div>
  );
}
